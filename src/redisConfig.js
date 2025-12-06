const dotenv = require('dotenv');

dotenv.config();

const redisHost = process.env.REDIS_HOST || 'redis';
const redisPort = Number.parseInt(process.env.REDIS_PORT || '6379', 10);
const redisUrl = process.env.REDIS_URL || `redis://${redisHost}:${redisPort}`;
const redisConnection = { host: redisHost, port: redisPort, maxRetriesPerRequest: null };

function createRedisClient (options = {}) {
  const Redis = require('ioredis');
  const { url, ...redisOptions } = options;
  return new Redis(url || redisUrl, redisOptions);
}

module.exports = { redisUrl, redisConnection, createRedisClient };
