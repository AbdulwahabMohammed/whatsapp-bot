const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');
const pool = require('./db');
const { messageQueue } = require('./queue');
const logger = require('./logger');
const { connectionGauge, messageCounter } = require('./metrics');
require('dotenv').config();

async function startForOrg(org, attempt = 0) {
  if (!org.assistant_id) {
    throw new Error(`Organization ${org.id} does not have an assistant`);
  }

  connectionGauge.labels(String(org.id)).set(0);

  const MAX_RECONNECTS = parseInt(process.env.MAX_RECONNECTS || '5', 10);

  const { state, saveCreds } = await useMultiFileAuthState(`auth-${org.id}`);
  const sock = makeWASocket({
    auth: state,
  });

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
              logger.error(`WhatsApp bot error for org ${org.id}:`, err);
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

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const sender = msg.key.remoteJid;
      let text =
        msg.message.conversation ||
        msg.message.extendedTextMessage?.text ||
        msg.message.imageMessage?.caption ||
        msg.message.documentMessage?.caption;

      const messageType = getContentType(msg.message);
      let attachmentType;
      let attachmentPath;
      if (messageType === 'imageMessage' || messageType === 'documentMessage') {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            'buffer',
            {},
            { logger, reuploadRequest: sock.updateMediaMessage }
          );
          fs.mkdirSync(path.join(__dirname, '../uploads'), { recursive: true });
          const ext =
            messageType === 'imageMessage'
              ? '.jpg'
              : path.extname(msg.message.documentMessage?.fileName || '.bin');
          const filename = `${Date.now()}-${msg.key.id}${ext}`;
          const fullPath = path.join(__dirname, '../uploads', filename);
          fs.writeFileSync(fullPath, buffer);
          attachmentType = messageType === 'imageMessage' ? 'image' : 'document';
          attachmentPath = path.join('uploads', filename);
        } catch (e) {
          logger.error('Failed to download attachment:', e);
        }
      }

      if (!text && !attachmentPath) continue;
      messageCounter.labels(String(org.id), 'received').inc();

      try {
        await messageQueue.add('message', {
          orgId: org.id,
          assistantId: org.assistant_id,
          sender,
          text,
          attachmentType,
          attachmentPath,
          receivedAt: Date.now(),
        });
      } catch (err) {
        logger.error('Failed to queue message:', err);
      }
    }
  });
}

async function start() {
  const { rows } = await pool.query('SELECT * FROM organizations WHERE assistant_id IS NOT NULL');
  if (rows.length === 0) {
    throw new Error('No organizations with assistants found');
  }
  for (const org of rows) {
    startForOrg(org).catch(err => {
      logger.error(`WhatsApp bot error for org ${org.id}:`, err);
    });
  }
}

start().catch(err => {
  logger.error('Failed to start WhatsApp bots:', err);
});
