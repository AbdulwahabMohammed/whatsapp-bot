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

async function startForOrg(org) {
  if (!org.assistant_id) {
    throw new Error(`Organization ${org.id} does not have an assistant`);
  }

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
      const shouldReconnect =
        (lastDisconnect?.error instanceof Boom ? lastDisconnect.error.output.statusCode : 0) !==
        DisconnectReason.loggedOut;
      if (shouldReconnect) startForOrg(org);
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

        const { rows } = await pool.query(
          'SELECT id FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
          [org.id, sender]
        );
        const conversationId = rows[0]?.id;
        if (conversationId) {
          await pool.query(
            'INSERT INTO messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
            [conversationId, 'user', text]
          );
          await pool.query(
            'INSERT INTO messages (conversation_id, sender, text) VALUES ($1, $2, $3)',
            [conversationId, 'assistant', reply]
          );
        }

        await sock.sendMessage(sender, { text: reply });
      } catch (err) {
        logger.error('Failed to handle message:', err);
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
