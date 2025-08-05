const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const { Worker } = require('bullmq');
const { sendMessage } = require('./chat');
const pool = require('./db');
const logger = require('./logger');
const openai = require('./openai');
const path = require('path');
const { connectionGauge, messageCounter } = require('./metrics');
const { startScheduler } = require('./scheduler');
require('dotenv').config();

function withinWorkingHours (start, end) {
  if (!start || !end) return true;
  const now = new Date();
  const [sh, sm] = String(start).split(':');
  const [eh, em] = String(end).split(':');
  const s = new Date(now);
  s.setHours(Number(sh), Number(sm), 0, 0);
  const e = new Date(now);
  e.setHours(Number(eh), Number(em), 0, 0);
  return now >= s && now <= e;
}

async function getOrCreateConversation (orgId, phone) {
  const { rows } = await pool.query(
    'SELECT id, thread_id, escalated FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
    [orgId, phone]
  );
  if (rows[0]) return rows[0];
  const thread = await openai.beta.threads.create();
  const insert = await pool.query(
    'INSERT INTO conversations (organization_id, customer_phone, thread_id) VALUES ($1,$2,$3) RETURNING *',
    [orgId, phone, thread.id]
  );
  return insert.rows[0];
}

const WEBHOOK_URL = process.env.WEBHOOK_URL;

async function postWebhook (data) {
  if (!WEBHOOK_URL) return;
  try {
    await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
  } catch (err) {
    logger.error('Failed to send webhook:', err);
  }
}

const SUMMARY_LIMIT = parseInt(process.env.SUMMARY_MESSAGE_LIMIT || '20', 10);
const BULK_MESSAGE_DELAY = Math.max(
  0,
  Math.min(parseInt(process.env.BULK_MESSAGE_DELAY || '500', 10) || 500, 60000)
);

const sockets = {};

async function startForOrg (org, attempt = 0) {
  if (!org.assistant_id) {
    throw new Error(`Organization ${org.id} does not have an assistant`);
  }

  connectionGauge.labels(String(org.id)).set(0);
  const MAX_RECONNECTS = parseInt(process.env.MAX_RECONNECTS || '5', 10);

  const { state, saveCreds } = await useMultiFileAuthState(`auth-${org.id}`);
  const sock = makeWASocket({ auth: state });
  sockets[org.id] = sock;

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      logger.info('Scan this QR code with WhatsApp:');
      qrcode.generate(qr, { small: true });
    }

    if (connection === 'close') {
      connectionGauge.labels(String(org.id)).set(0);
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 0) !==
        DisconnectReason.loggedOut;
      if (shouldReconnect) {
        if (attempt < MAX_RECONNECTS) {
          const delay = Math.min(30000, 2 ** attempt * 1000);
          const nextAttempt = attempt + 1;
          logger.warn(
            `WhatsApp disconnected for org ${org.id}, retrying in ${delay}ms (attempt ${nextAttempt}/${MAX_RECONNECTS})`
          );
          setTimeout(() => {
            startForOrg(org, nextAttempt).catch(err => {
              logger.error(`WhatsApp worker error for org ${org.id}:`, err);
            });
          }, delay);
        } else {
          logger.error(`Max reconnect attempts reached for org ${org.id}`);
        }
      }
    } else if (connection === 'open') {
      logger.info('WhatsApp connection established');
      connectionGauge.labels(String(org.id)).set(1);
    }
  });

  sock.ev.on('creds.update', saveCreds);
}

// eslint-disable-next-line no-unused-vars
const worker = new Worker(
  'messages',
  async job => {
    const {
      orgId,
      assistantId,
      sender,
      text,
      attachmentType,
      attachmentPath,
      replyAttachmentType,
      replyAttachmentPath
    } = job.data;
    const sock = sockets[orgId];
    if (!sock) {
      logger.error(`No WhatsApp connection for org ${orgId}`);
      return;
    }
    try {
      const { rows: orgRows } = await pool.query(
        'SELECT working_hours_start, working_hours_end, instructions FROM organizations WHERE id=$1',
        [orgId]
      );
      const org = orgRows[0] || {};
      const conv = await getOrCreateConversation(orgId, sender);
      if (conv.escalated) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conv.id, 'user', text, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text,
          timestamp: job.data.receivedAt || Date.now()
        });
        return;
      }

      if (!withinWorkingHours(org.working_hours_start, org.working_hours_end)) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conv.id, 'user', text, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text,
          timestamp: job.data.receivedAt || Date.now()
        });
        const reply = org.instructions || 'سنعود خلال ساعات العمل';
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text) VALUES ($1,$2,$3)',
          [conv.id, 'assistant', reply]
        );
        await postWebhook({ sender: 'assistant', text: reply, timestamp: Date.now() });
        const latency = Date.now() - (job.data.receivedAt || Date.now());
        await pool.query(
          'INSERT INTO conversation_stats (conversation_id, response_time_ms) VALUES ($1,$2)',
          [conv.id, latency]
        );
        messageCounter.labels(String(orgId), 'sent').inc();
        await sock.sendMessage(sender, { text: reply });
        return;
      }

      const reply = await sendMessage(orgId, assistantId, sender, text);
      if (reply === null) {
        const conversationId = conv.id;
        if (conversationId) {
          await pool.query(
            'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
            [conversationId, 'user', text, attachmentType, attachmentPath]
          );
          await postWebhook({
            sender,
            text,
            timestamp: job.data.receivedAt || Date.now()
          });
        }
        return;
      }
      if (/لا أفهم|غير واضح/.test(reply)) {
        await pool.query(
          'INSERT INTO unanswered_questions (phone, message) VALUES ($1,$2)',
          [sender, text]
        );
      }
      const conversationId = conv.id;
      if (conversationId) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'user', text, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text,
          timestamp: job.data.receivedAt || Date.now()
        });
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'assistant', reply, replyAttachmentType, replyAttachmentPath]
        );
        await postWebhook({
          sender: 'assistant',
          text: reply,
          timestamp: Date.now()
        });

        const latency = Date.now() - (job.data.receivedAt || Date.now());
        await pool.query(
          'INSERT INTO conversation_stats (conversation_id, response_time_ms) VALUES ($1,$2)',
          [conversationId, latency]
        );

        const { rows: countRows } = await pool.query('SELECT COUNT(*) FROM messages WHERE conversation_id=$1', [conversationId]);
        const count = parseInt(countRows[0].count, 10);
        if (count >= SUMMARY_LIMIT) {
          const { rows: convRows } = await pool.query('SELECT summary FROM conversations WHERE id=$1', [conversationId]);
          if (!convRows[0]?.summary) {
            const { rows: msgs } = await pool.query('SELECT sender, text FROM messages WHERE conversation_id=$1 ORDER BY id', [conversationId]);
            const convoText = msgs.map(m => `${m.sender}: ${m.text}`).join('\n');
            try {
              const resp = await openai.chat.completions.create({
                model: 'gpt-3.5-turbo',
                messages: [
                  { role: 'system', content: 'Summarize the following conversation briefly.' },
                  { role: 'user', content: convoText }
                ]
              });
              const summary = resp.choices?.[0]?.message?.content?.trim();
              if (summary) {
                await pool.query('UPDATE conversations SET summary=$1 WHERE id=$2', [summary, conversationId]);
              }
            } catch (err) {
              logger.error('Failed to generate summary:', err);
            }
          }
        }
      }
      messageCounter.labels(String(orgId), 'sent').inc();
      let content = { text: reply };
      if (replyAttachmentPath) {
        if (replyAttachmentType === 'image') {
          content = {
            image: { url: path.join(__dirname, '..', replyAttachmentPath) },
            caption: reply
          };
        } else if (replyAttachmentType === 'document') {
          content = {
            document: { url: path.join(__dirname, '..', replyAttachmentPath) },
            caption: reply
          };
        }
      }
      await sock.sendMessage(sender, content);
    } catch (err) {
      if (err && (err.status === 429 || err.code === 'insufficient_quota')) {
        logger.warn('OpenAI quota exceeded or rate limited:', err);
        try {
          await sock.sendMessage(sender, {
            text: 'Service temporarily unavailable. Please try again later.'
          });
        } catch (notifyErr) {
          logger.error('Failed to notify user about service outage:', notifyErr);
        }
      } else {
        logger.error('Failed to process job:', err);
      }
    }
  },
  { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }
);

// eslint-disable-next-line no-unused-vars
const bulkWorker = new Worker(
  'bulkMessages',
  async job => {
    const { orgId, phones, text } = job.data;
    const sock = sockets[orgId];
    if (!sock) {
      logger.error(`No WhatsApp connection for org ${orgId}`);
      return;
    }
    for (const phone of phones) {
      try {
        const { rows } = await pool.query(
          'SELECT id FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
          [orgId, phone]
        );
        let conversationId = rows[0]?.id;
        if (!conversationId) {
          const thread = await openai.beta.threads.create();
          const insert = await pool.query(
            'INSERT INTO conversations (organization_id, customer_phone, thread_id) VALUES ($1,$2,$3) RETURNING id',
            [orgId, phone, thread.id]
          );
          conversationId = insert.rows[0].id;
        }
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text) VALUES ($1,$2,$3)',
          [conversationId, 'admin', text]
        );
        await postWebhook({
          sender: 'admin',
          text,
          timestamp: Date.now()
        });
        await sock.sendMessage(phone, { text });
        await new Promise(resolve => setTimeout(resolve, BULK_MESSAGE_DELAY));
      } catch (err) {
        logger.error('Failed to send bulk message:', err);
      }
    }
  },
  { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }
);

async function start () {
  const { rows } = await pool.query(
    `SELECT o.id, b.assistant_id
     FROM organizations o
     JOIN bots b ON b.organization_id = o.id
     WHERE b.assistant_id IS NOT NULL AND (b.status IS NULL OR b.status = 'active')`
  );
  if (rows.length === 0) {
    throw new Error('No organizations with assistants found');
  }
  for (const org of rows) {
    startForOrg(org).catch(err => {
      logger.error(`WhatsApp worker error for org ${org.id}:`, err);
    });
  }
}

start().catch(err => {
  logger.error('Failed to start worker:', err);
});

startScheduler();
