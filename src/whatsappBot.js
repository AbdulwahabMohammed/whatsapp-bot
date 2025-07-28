const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const qrcode = require('qrcode-terminal');
const pool = require('./db');
const { sendMessage } = require('./chat');
const logger = require('./logger');
require('dotenv').config();

async function start() {
  const orgId = process.env.ORGANIZATION_ID;
  if (!orgId) {
    throw new Error('ORGANIZATION_ID not set in environment');
  }
  const { rows } = await pool.query('SELECT * FROM organizations WHERE id=$1', [orgId]);
  const org = rows[0];
  if (!org || !org.assistant_id) {
    throw new Error('Organization or assistant not found');
  }

  const { state, saveCreds } = await useMultiFileAuthState('auth');
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
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 0) !==
        DisconnectReason.loggedOut;
      if (shouldReconnect) start();
    } else if (connection === 'open') {
      logger.info('WhatsApp connection established');
    }
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      if (!msg.message || msg.key.fromMe) continue;
      const sender = msg.key.remoteJid;
      const text = msg.message.conversation || msg.message.extendedTextMessage?.text;
      if (!text) continue;

      try {
        const reply = await sendMessage(org.id, org.assistant_id, sender, text);
        await sock.sendMessage(sender, { text: reply });
      } catch (err) {
        logger.error('Failed to handle message:', err);
      }
    }
  });
}

start().catch(err => {
  logger.error('WhatsApp bot error:', err);
});
