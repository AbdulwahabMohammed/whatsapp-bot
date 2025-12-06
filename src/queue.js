const { Queue } = require('bullmq');
require('dotenv').config();

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';
const connection = { url: redisUrl };

const messageQueue = new Queue('messages', { connection });
const bulkQueue = new Queue('bulkMessages', { connection });

async function getQueueLength () {
  const regular = await messageQueue.getWaitingCount();
  const bulk = await bulkQueue.getWaitingCount();
  return regular + bulk;
}

module.exports = { messageQueue, bulkQueue, getQueueLength };
