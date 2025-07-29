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
const { connectionGauge, messageCounter } = require('./metrics');
require('dotenv').config();

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
    const { orgId, assistantId, sender, text } = job.data;
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
        await pool.query('INSERT INTO messages (conversation_id, sender, text) VALUES ($1,$2,$3)', [conversationId, 'user', text]);
        await pool.query('INSERT INTO messages (conversation_id, sender, text) VALUES ($1,$2,$3)', [conversationId, 'assistant', reply]);
      }
      messageCounter.labels(String(orgId), 'sent').inc();
      await sock.sendMessage(sender, { text: reply });
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
