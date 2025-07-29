const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
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
require('dotenv').config();

const SUMMARY_LIMIT = parseInt(process.env.SUMMARY_MESSAGE_LIMIT || '20', 10);

const sockets = {};

async function startForOrg(org, attempt = 0) {
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
      replyAttachmentPath,
    } = job.data;
    const sock = sockets[orgId];
    if (!sock) {
      logger.error(`No WhatsApp connection for org ${orgId}`);
      return;
    }
    try {
      const reply = await sendMessage(orgId, assistantId, sender, text);
      const { rows } = await pool.query(
        'SELECT id FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
        [orgId, sender]
      );
      const conversationId = rows[0]?.id;
      if (conversationId) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'user', text, attachmentType, attachmentPath]
        );
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'assistant', reply, replyAttachmentType, replyAttachmentPath]
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
            caption: reply,
          };
        } else if (replyAttachmentType === 'document') {
          content = {
            document: { url: path.join(__dirname, '..', replyAttachmentPath) },
            caption: reply,
          };
        }
      }
      await sock.sendMessage(sender, content);
    } catch (err) {
      logger.error('Failed to process job:', err);
    }
  },
  { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }
);

async function start() {
  const { rows } = await pool.query('SELECT * FROM organizations WHERE assistant_id IS NOT NULL');
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
