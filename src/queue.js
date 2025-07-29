const { Queue } = require('bullmq');
require('dotenv').config();

const connection = { url: process.env.REDIS_URL || 'redis://localhost:6379' };

const messageQueue = new Queue('messages', { connection });

async function getQueueLength() {
  return messageQueue.getWaitingCount();
}

module.exports = { messageQueue, getQueueLength };
