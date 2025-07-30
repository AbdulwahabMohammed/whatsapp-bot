const { Queue } = require('bullmq');
require('dotenv').config();

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

const messageQueue = new Queue('messages', { connection });
const bulkQueue = new Queue('bulkMessages', { connection });

async function getQueueLength () {
  const regular = await messageQueue.getWaitingCount();
  const bulk = await bulkQueue.getWaitingCount();
  return regular + bulk;
}

module.exports = { messageQueue, bulkQueue, getQueueLength };
