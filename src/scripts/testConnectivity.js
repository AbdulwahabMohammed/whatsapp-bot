const { Client } = require('pg');
const Redis = require('ioredis');

const redisUrl = process.env.REDIS_URL || 'redis://redis:6379';

function getPgConfig () {
  const config = {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD
  };

  if (process.env.PGPORT) {
    const port = parseInt(process.env.PGPORT, 10);
    if (!Number.isNaN(port)) {
      config.port = port;
    }
  }

  return config;
}

async function testRedis () {
  console.log(`Testing Redis at ${redisUrl}`);
  const redis = new Redis(redisUrl, { lazyConnect: true });

  try {
    await redis.connect();
    const response = await redis.ping();
    console.log(`Redis OK (PING response: ${response})`);
  } catch (error) {
    console.error(`Redis connection failed at ${redisUrl}:`, error);
    throw error;
  } finally {
    redis.disconnect();
  }
}

async function testPostgres () {
  const config = getPgConfig();
  const host = config.host || 'localhost';
  const port = config.port || '(default)';
  const database = config.database || '(default)';
  console.log(`Testing Postgres at ${host}:${port}/${database}`);

  const client = new Client(config);

  try {
    await client.connect();
    await client.query('SELECT NOW()');
    console.log('Postgres OK');
  } catch (error) {
    console.error(`Postgres connection failed at ${host}:${port}/${database}:`, error);
    throw error;
  } finally {
    await client.end().catch(() => {});
  }
}

async function main () {
  const args = process.argv.slice(2);
  const onlyRedis = args.includes('--redis');
  const onlyDb = args.includes('--db');
  const runRedis = onlyRedis || (!onlyRedis && !onlyDb);
  const runDb = onlyDb || (!onlyRedis && !onlyDb);

  try {
    if (runRedis) {
      await testRedis();
    }

    if (runDb) {
      await testPostgres();
    }

    console.log('Connectivity tests passed.');
    process.exit(0);
  } catch (error) {
    process.exit(1);
  }
}

main();
