const { Worker } = require('bullmq');
const path = require('path');
const { sendMessage } = require('./chat');
const pool = require('./db');
const logger = require('./logger');
const openai = require('./openai');
const { messageCounter } = require('./metrics');
const { startScheduler } = require('./scheduler');
const { getSocket, startBot } = require('./botManager');

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

// message worker
// eslint-disable-next-line no-unused-vars
const worker = new Worker(
  'messages',
  async job => {
    const {
      botId,
      orgId,
      assistantId,
      sender,
      text,
      attachmentType,
      attachmentPath,
      replyAttachmentType,
      replyAttachmentPath
    } = job.data;
    const messageText = text || '';

    let sock = getSocket(botId);
    if (!sock) {
      // try to start the bot if not running
      const { rows } = await pool.query('SELECT * FROM bots WHERE id=$1', [botId]);
      if (rows[0]) {
        await startBot(rows[0]);
        sock = getSocket(botId);
      }
    }
    if (!sock) {
      logger.error(`No WhatsApp connection for bot ${botId}`);
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
          [conv.id, 'user', messageText, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text: messageText,
          timestamp: job.data.receivedAt || Date.now()
        });
        return;
      }

      if (!withinWorkingHours(org.working_hours_start, org.working_hours_end)) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conv.id, 'user', messageText, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text: messageText,
          timestamp: job.data.receivedAt || Date.now()
        });
        const reply = org.instructions || 'سنعود خلال ساعات العمل';
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text) VALUES ($1,$2,$3)',
          [conv.id, 'assistant', reply || '']
        );
        await postWebhook({ sender: 'assistant', text: reply || '', timestamp: Date.now() });
        const latency = Date.now() - (job.data.receivedAt || Date.now());
        await pool.query(
          'INSERT INTO conversation_stats (conversation_id, response_time_ms) VALUES ($1,$2)',
          [conv.id, latency]
        );
        messageCounter.labels(String(botId), 'sent').inc();
        await sock.sendMessage(sender, { text: reply });
        return;
      }

      const reply = await sendMessage(orgId, assistantId, sender, messageText);
      if (reply === null) {
        const conversationId = conv.id;
        if (conversationId) {
          await pool.query(
            'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
            [conversationId, 'user', messageText, attachmentType, attachmentPath]
          );
          await postWebhook({
            sender,
            text: messageText,
            timestamp: job.data.receivedAt || Date.now()
          });
        }
        return;
      }
      if (/لا أفهم|غير واضح/.test(reply)) {
        await pool.query(
          'INSERT INTO unanswered_questions (phone, message) VALUES ($1,$2)',
          [sender, messageText]
        );
      }
      const conversationId = conv.id;
      if (conversationId) {
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'user', messageText, attachmentType, attachmentPath]
        );
        await postWebhook({
          sender,
          text: messageText,
          timestamp: job.data.receivedAt || Date.now()
        });
        await pool.query(
          'INSERT INTO messages (conversation_id, sender, text, attachment_type, attachment_path) VALUES ($1,$2,$3,$4,$5)',
          [conversationId, 'assistant', reply || '', replyAttachmentType, replyAttachmentPath]
        );
        await postWebhook({
          sender: 'assistant',
          text: reply || '',
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
      messageCounter.labels(String(botId), 'sent').inc();
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

// bulk message worker
// eslint-disable-next-line no-unused-vars
const bulkWorker = new Worker(
  'bulkMessages',
  async job => {
    const { botId, orgId, phones, text } = job.data;
    const bulkText = text || '';
    const sock = getSocket(botId);
    if (!sock) {
      logger.error(`No WhatsApp connection for bot ${botId}`);
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
          [conversationId, 'admin', bulkText]
        );
        await postWebhook({
          sender: 'admin',
          text: bulkText,
          timestamp: Date.now()
        });
        await sock.sendMessage(phone, { text: bulkText });
        await new Promise(resolve => setTimeout(resolve, BULK_MESSAGE_DELAY));
      } catch (err) {
        logger.error('Failed to send bulk message:', err);
      }
    }
  },
  { connection: { url: process.env.REDIS_URL || 'redis://localhost:6379' } }
);

startScheduler();
