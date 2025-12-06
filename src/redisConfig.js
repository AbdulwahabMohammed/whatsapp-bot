const dotenv = require('dotenv');

dotenv.config();

const DEFAULT_REDIS_URL = 'redis://redis:6379';
const redisUrl = process.env.REDIS_URL || DEFAULT_REDIS_URL;
const redisConnection = { url: redisUrl };

function createRedisClient (options = {}) {
  const Redis = require('ioredis');
  const { url, ...redisOptions } = options;
  return new Redis(url || redisUrl, redisOptions);
}

module.exports = { redisUrl, redisConnection, createRedisClient };
