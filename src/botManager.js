const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');
const { downloadMediaMessage, getContentType } = require('@whiskeysockets/baileys');
const qrcode = require('qrcode-terminal');
const logger = require('./logger');
const { messageQueue } = require('./queue');
const { connectionGauge, messageCounter } = require('./metrics');

// Store bot state in memory
const bots = new Map(); // botId -> { sock, status, orgId, assistantId }

// Event emitter for websocket notifications
const events = new EventEmitter();

function getBotStatus (botId) {
  return bots.get(botId)?.status || 'stopped';
}

function getSocket (botId) {
  return bots.get(botId)?.sock;
}

async function startBot (bot, attempt = 0) {
  const botId = bot.id;
  const orgId = bot.organization_id;
  const assistantId = bot.assistant_id;

  connectionGauge.labels(String(botId)).set(0);
  bots.set(botId, { ...bots.get(botId), status: 'starting', orgId, assistantId });
  events.emit('update', { botId, status: 'starting' });

  const MAX_RECONNECTS = parseInt(process.env.MAX_RECONNECTS || '5', 10);

  const { state, saveCreds } = await useMultiFileAuthState(`auth-${botId}`);
  const sock = makeWASocket({ auth: state });
  bots.set(botId, { ...bots.get(botId), sock });

  sock.ev.on('connection.update', update => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      // Display in console and emit for frontend
      try { qrcode.generate(qr, { small: true }); } catch (e) {}
      events.emit('update', { botId, status: 'qr', qr });
    }

    if (connection === 'close') {
      connectionGauge.labels(String(botId)).set(0);
      const statusCode =
        lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 0;
      if (statusCode === DisconnectReason.connectionReplaced) {
        const message = `Session conflict. Delete auth-${botId} and scan QR again.`;
        bots.set(botId, { ...bots.get(botId), sock: null, status: 'conflict' });
        events.emit('update', { botId, status: 'conflict', message });
        logger.warn(`Bot ${botId}: ${message}`);
        return;
      }
      bots.set(botId, { ...bots.get(botId), status: 'disconnected' });
      events.emit('update', { botId, status: 'disconnected' });
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      if (shouldReconnect && attempt < MAX_RECONNECTS) {
        const delay = Math.min(30000, 2 ** attempt * 1000);
        setTimeout(() => {
          startBot(bot, attempt + 1).catch(err => {
            logger.error(`WhatsApp bot error for bot ${botId}:`, err);
          });
        }, delay);
      }
    } else if (connection === 'open') {
      connectionGauge.labels(String(botId)).set(1);
      bots.set(botId, { ...bots.get(botId), status: 'connected' });
      events.emit('update', { botId, status: 'connected' });
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    try {
      for (const msg of messages) {
        if (!msg.message || msg.key.fromMe) continue;
        const sender = msg.key.remoteJid;
        const text =
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
        messageCounter.labels(String(botId), 'received').inc();

        try {
          await messageQueue.add('message', {
            botId,
            orgId,
            assistantId,
            sender,
            text,
            attachmentType,
            attachmentPath,
            receivedAt: Date.now()
          });
        } catch (err) {
          logger.error('Failed to queue message:', err);
        }
      }
    } catch (err) {
      const isSessionErr =
        err?.name === 'SessionError' ||
        /Bad MAC/i.test(err?.message || '') ||
        /SessionError/i.test(err?.message || '');
      if (isSessionErr) {
        logger.warn(`Bot ${botId}: session error detected: ${err.message}`);
        stopBot(botId);
        try {
          fs.rmSync(path.join(__dirname, `../auth-${botId}`), { recursive: true, force: true });
        } catch (e) {
          logger.error(`Failed to remove auth-${botId}:`, e);
        }
        events.emit('update', {
          botId,
          status: 'stopped',
          message: 'Session error. Please scan QR again.'
        });
      } else {
        logger.error('Failed to process message:', err);
      }
    }
  });
}

function stopBot (botId) {
  const bot = bots.get(botId);
  if (bot?.sock) {
    try { bot.sock.end?.(); } catch (e) {}
    try { bot.sock.logout?.(); } catch (e) {}
  }
  bots.set(botId, { ...bot, sock: null, status: 'stopped' });
  connectionGauge.labels(String(botId)).set(0);
  events.emit('update', { botId, status: 'stopped' });
}

module.exports = { startBot, stopBot, getBotStatus, getSocket, events };
