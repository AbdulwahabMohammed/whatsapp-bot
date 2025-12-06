const logger = require('./logger');
const { checkEnv } = require('./checkEnv');
const { Worker } = require('bullmq');
const path = require('path');
const { sendMessage } = require('./chat');
const pool = require('./db');

const envCheckPromise = checkEnv();

let openai;
let openaiInitError;
try {
  openai = require('./openai');
} catch (error) {
  openaiInitError = error;
  logger.error('Failed to initialize OpenAI client for worker module:', error);
}
const { messageCounter } = require('./metrics');
const { startScheduler } = require('./scheduler');
const { getSocket, startBot } = require('./botManager');
const { messageQueue, bulkQueue } = require('./queue');
const { MIN_REDIS_VERSION, ensureRedisVersion } = require('./redisVersion');
const { redisConnection, redisUrl } = require('./redisConfig');

const FAST_DEV = process.env.FAST_DEV === 'true';

function isUnset (value) {
  return value === undefined || value === null || value === '';
}

function resolveIntEnv (name, defaultValue, devDefault) {
  const raw = process.env[name];
  const fallback = FAST_DEV && isUnset(raw) ? devDefault : defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const MIN_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 60000;
const DEFAULT_RETRY_DELAY_MS = 5000;
const DEV_RETRY_DELAY_MS = 1000;
const CONNECTION_RETRY_DELAY_MS = Math.min(
  MAX_RETRY_DELAY_MS,
  Math.max(
    MIN_RETRY_DELAY_MS,
    resolveIntEnv('CONNECTION_RETRY_DELAY', DEFAULT_RETRY_DELAY_MS, DEV_RETRY_DELAY_MS)
  )
);

function isSocketOpen (sock) {
  return Boolean(sock?.ws?.readyState === 'open');
}

async function ensureSocketOpen (botId) {
  let sock = getSocket(botId);
  if (isSocketOpen(sock)) {
    return { sock, retriable: true };
  }

  let botRow;
  try {
    const { rows } = await pool.query('SELECT * FROM whatsapp_bots WHERE id=$1', [botId]);
    botRow = rows[0];
  } catch (err) {
    logger.error(`Failed to load bot ${botId} for reconnection:`, err);
    return { sock: null, retriable: true };
  }

  if (!botRow) {
    logger.error(`Bot ${botId} not found while trying to establish a WhatsApp connection.`);
    return { sock: null, retriable: false };
  }

  try {
    await startBot(botRow);
  } catch (err) {
    logger.error(`Failed to start bot ${botId}:`, err);
    return { sock: null, retriable: true };
  }

  sock = getSocket(botId);
  if (isSocketOpen(sock)) {
    return { sock, retriable: true };
  }

  return { sock: null, retriable: true };
}

async function rescheduleJob (job, queue, defaultJobName, reason, overrideData) {
  const jobName = job.name || defaultJobName;
  const delay = CONNECTION_RETRY_DELAY_MS;
  const data = overrideData ?? job.data;
  const contextId = job.id || jobName;
  logger.warn(
    `Rescheduling job ${contextId} due to WhatsApp connection issue: ${reason}. Retrying in ${delay}ms.`
  );

  if (typeof job.retry === 'function') {
    try {
      await job.retry();
      return;
    } catch (err) {
      logger.warn('job.retry failed, falling back to queue requeue:', err);
    }
  }

  try {
    await queue.add(jobName, data, { delay });
  } catch (err) {
    logger.error('Failed to enqueue job retry:', err);
    throw err;
  }
}

async function ensureReadySocketOrReschedule (
  job,
  botId,
  queue,
  defaultJobName,
  currentSock,
  overrideData
) {
  if (isSocketOpen(currentSock)) {
    return currentSock;
  }

  const { sock, retriable } = await ensureSocketOpen(botId);
  if (sock) {
    return sock;
  }

  if (retriable) {
    const state = getSocket(botId)?.ws?.readyState ?? 'unavailable';
    await rescheduleJob(job, queue, defaultJobName, `state ${state}`, overrideData);
  }

  return null;
}

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
  if (!openai) {
    logger.error(
      `OpenAI client unavailable while creating conversation for organization ${orgId} and phone ${phone}.`,
      openaiInitError
    );
    const insert = await pool.query(
      'INSERT INTO conversations (organization_id, customer_phone, thread_id) VALUES ($1,$2,$3) RETURNING *',
      [orgId, phone, null]
    );
    return insert.rows[0];
  }
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
const DEFAULT_BULK_DELAY_MS = 500;
const DEV_BULK_DELAY_MS = 0;
const BULK_MESSAGE_DELAY = Math.max(
  0,
  Math.min(resolveIntEnv('BULK_MESSAGE_DELAY', DEFAULT_BULK_DELAY_MS, DEV_BULK_DELAY_MS), 60000)
);

function startWorkers () {
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

      const socketResult = await ensureSocketOpen(botId);
      let sock = socketResult.sock;
      if (!sock) {
        if (socketResult.retriable) {
          const state = getSocket(botId)?.ws?.readyState ?? 'unavailable';
          await rescheduleJob(job, messageQueue, job.name || 'message', `state ${state}`);
        } else {
          logger.error(`Unable to start WhatsApp bot ${botId}; dropping job ${job.id || 'messages'}.`);
        }
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
          sock = await ensureReadySocketOrReschedule(
            job,
            botId,
            messageQueue,
            job.name || 'message',
            sock,
            undefined
          );
          if (!sock) return;
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
              if (!openai) {
                logger.error(
                  `Skipping conversation summary for conversation ${conversationId} because OpenAI client is unavailable.`,
                  openaiInitError
                );
              } else {
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
        sock = await ensureReadySocketOrReschedule(
          job,
          botId,
          messageQueue,
          job.name || 'message',
          sock,
          undefined
        );
        if (!sock) return;
        await sock.sendMessage(sender, content);
      } catch (err) {
        if (err && (err.status === 429 || err.code === 'insufficient_quota')) {
          logger.warn('OpenAI quota exceeded or rate limited:', err);
          try {
            sock = await ensureReadySocketOrReschedule(
              job,
              botId,
              messageQueue,
              job.name || 'message',
              sock,
              undefined
            );
            if (sock) {
              await sock.sendMessage(sender, {
                text: 'Service temporarily unavailable. Please try again later.'
              });
            }
          } catch (notifyErr) {
            logger.error('Failed to notify user about service outage:', notifyErr);
          }
        } else {
          logger.error('Failed to process job:', err);
        }
      }
    },
    { connection: redisConnection }
  );

  // bulk message worker
  // eslint-disable-next-line no-unused-vars
  const bulkWorker = new Worker(
    'bulkMessages',
    async job => {
      const { botId, orgId, phones, text } = job.data;
      const bulkText = text || '';
      const socketResult = await ensureSocketOpen(botId);
      let sock = socketResult.sock;
      if (!sock) {
        if (socketResult.retriable) {
          const state = getSocket(botId)?.ws?.readyState ?? 'unavailable';
          await rescheduleJob(job, bulkQueue, job.name || 'broadcast', `state ${state}`);
        } else {
          logger.error(
            `Unable to start WhatsApp bot ${botId} for bulk job ${job.id || 'bulkMessages'}.`
          );
        }
        return;
      }
      for (let index = 0; index < phones.length; index++) {
        const phone = phones[index];
        try {
          sock = await ensureReadySocketOrReschedule(
            job,
            botId,
            bulkQueue,
            job.name || 'broadcast',
            sock,
            { ...job.data, phones: phones.slice(index) }
          );
          if (!sock) return;
          const { rows } = await pool.query(
            'SELECT id FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
            [orgId, phone]
          );
          let conversationId = rows[0]?.id;
          if (!conversationId) {
            let threadId = null;
            if (!openai) {
              logger.error(
                `OpenAI client unavailable while preparing bulk conversation for organization ${orgId}.`,
                openaiInitError
              );
            } else {
              try {
                const thread = await openai.beta.threads.create();
                threadId = thread.id;
              } catch (err) {
                logger.error('Failed to create OpenAI thread for bulk message:', err);
              }
            }
            const insert = await pool.query(
              'INSERT INTO conversations (organization_id, customer_phone, thread_id) VALUES ($1,$2,$3) RETURNING id',
              [orgId, phone, threadId]
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
    { connection: redisConnection }
  );
  return { worker, bulkWorker };
}

async function bootstrap () {
  try {
    await envCheckPromise;
  } catch (error) {
    logger.error(`Environment validation failed: ${error.message}`, { stack: error.stack });
    process.exit(1);
    return;
  }

  try {
    const version = await ensureRedisVersion({ url: redisUrl, minVersion: MIN_REDIS_VERSION });
    logger.info(`Redis version ${version} verified (required ≥ ${MIN_REDIS_VERSION}).`);
  } catch (error) {
    if (error.code === 'REDIS_VERSION_UNSUPPORTED') {
      logger.error(
        `Redis ${MIN_REDIS_VERSION}+ is required but detected version ${error.currentVersion}. ` +
          'Upgrade the server or start a compatible container, for example: "docker run -p 6379:6379 redis:7-alpine".'
      );
    } else if (error.code === 'REDIS_VERSION_UNKNOWN') {
      logger.error(
        'Unable to determine the Redis server version. Ensure the INFO command is enabled and upgrade to Redis ≥ 6.2.0.'
      );
    } else {
      logger.error(`Failed to verify Redis version: ${error.message}`, error);
    }
    process.exit(1);
  }

  startWorkers();
  startScheduler();
}

const bootstrapPromise = bootstrap();

module.exports = {
  bootstrapPromise,
  __internals: {
    FAST_DEV,
    CONNECTION_RETRY_DELAY_MS,
    BULK_MESSAGE_DELAY
  }
};
