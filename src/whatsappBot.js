const pool = require('./db');
const { startBot, stopBot, getBotStatus } = require('./botManager');

async function start (botId) {
  const { rows } = await pool.query('SELECT * FROM whatsapp_bots WHERE id=$1', [botId]);
  const bot = rows[0];
  if (!bot) throw new Error('Bot not found');
  await startBot(bot);
}

module.exports = { start, stopBot, getBotStatus };
