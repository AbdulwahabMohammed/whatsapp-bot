const cron = require('node-cron');
const pool = require('./db');
const { messageQueue } = require('./queue');
const logger = require('./logger');

async function dispatchScheduled() {
  await pool.query(
    "DELETE FROM scheduled_messages WHERE send_at < NOW() - INTERVAL '1 day'"
  );
  const { rows } = await pool.query(
    'DELETE FROM scheduled_messages WHERE send_at <= NOW() RETURNING organization_id, phone, text'
  );
  for (const row of rows) {
    await messageQueue.add('send', {
      orgId: row.organization_id,
      sender: row.phone,
      text: row.text,
      receivedAt: Date.now(),
    });
  }
  if (rows.length) {
    logger.info(`Dispatched ${rows.length} scheduled messages`);
  }
}

function startScheduler() {
  return cron.schedule('* * * * *', dispatchScheduled);
}

if (require.main === module) {
  startScheduler();
}

module.exports = { startScheduler, dispatchScheduled };
