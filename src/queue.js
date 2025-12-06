const { Queue } = require('bullmq');
const { redisConnection } = require('./redisConfig');

const messageQueue = new Queue('messages', { connection: redisConnection });
const bulkQueue = new Queue('bulkMessages', { connection: redisConnection });

async function getQueueLength () {
  const regular = await messageQueue.getWaitingCount();
  const bulk = await bulkQueue.getWaitingCount();
  return regular + bulk;
}

module.exports = { messageQueue, bulkQueue, getQueueLength };
