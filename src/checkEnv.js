const fs = require('fs');
const dotenv = require('dotenv');
const { Client } = require('pg');
const logger = require('./logger');
const { createRedisClient, redisUrl } = require('./redisConfig');
const { getAuthPath, ensureAuthBaseDir } = require('./paths');

dotenv.config();

const REQUIRED_PG_ENV = ['PGHOST', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];
let cachedPromise;

function ensureOpenAIKey () {
  if (!process.env.OPENAI_API_KEY) {
    const error = new Error('OPENAI_API_KEY is not set.');
    error.code = 'OPENAI_API_KEY_MISSING';
    logger.error(error.message);
    throw error;
  }

  logger.info('OpenAI API key present.');
}

function buildPostgresConfig () {
  const missing = REQUIRED_PG_ENV.filter(name => !process.env[name]);
  if (missing.length > 0) {
    const error = new Error(
      `Missing PostgreSQL environment variables: ${missing.join(', ')}.`
    );
    error.code = 'POSTGRES_ENV_MISSING';
    throw error;
  }

  const port = parseInt(process.env.PGPORT, 10);
  if (Number.isNaN(port)) {
    const error = new Error('PGPORT must be a valid number.');
    error.code = 'POSTGRES_ENV_INVALID';
    throw error;
  }

  return {
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port
  };
}

async function ensurePostgresReady () {
  const config = buildPostgresConfig();
  const client = new Client({
    ...config,
    connectionTimeoutMillis: parseInt(process.env.PGCONNECT_TIMEOUT || '5000', 10)
  });

  try {
    logger.info(`Checking PostgreSQL connectivity at ${config.host}:${config.port}/${config.database}`);
    await client.connect();
    await client.query('SELECT 1');
    logger.info('PostgreSQL connection OK.');
    return client;
  } catch (cause) {
    const message = `Unable to connect to PostgreSQL at ${config.host}:${config.port}/${config.database}: ${cause.message}`;
    logger.error(message, cause);
    const error = new Error(message);
    error.code = 'POSTGRES_CONNECTION_FAILED';
    error.cause = cause;
    throw error;
  }
}

async function ensureWhatsAppAuthFolders (client) {
  const baseDir = ensureAuthBaseDir();
  let botsResult;
  try {
    botsResult = await client.query('SELECT id, name, phone FROM whatsapp_bots ORDER BY id');
  } catch (error) {
    if (error.code === '42P01') {
      const missingTableError = new Error(
        'Table "whatsapp_bots" is missing. Run the migrations (npm run migrate or docker compose run --rm migrate) before starting the app.'
      );
      missingTableError.code = 'TABLES_NOT_MIGRATED';
      missingTableError.cause = error;
      throw missingTableError;
    }
    throw error;
  }
  const { rows } = botsResult;
  if (!rows.length) {
    return;
  }

  const missing = [];
  for (const bot of rows) {
    const folderPath = getAuthPath(bot.id);
    if (!fs.existsSync(folderPath)) {
      missing.push(folderPath);
    }
  }

  if (missing.length) {
    const error = new Error('Missing WhatsApp auth folders');
    error.code = 'MISSING_WHATSAPP_AUTH_FOLDERS';
    error.details = missing;
    logger.error('Missing WhatsApp auth folders', { missing });
    throw error;
  }

  logger.info(`WhatsApp auth base directory ready at ${baseDir}.`);
}

async function ensureRedisReady () {
  const redis = createRedisClient({ lazyConnect: true });

  try {
    logger.info(`Checking Redis connectivity at: ${redisUrl}`);
    await redis.connect();
    await redis.ping();
    logger.info('Redis connection OK.');
  } catch (cause) {
    logger.error(`Failed to connect to Redis at ${redisUrl}`, cause);
    const error = new Error(`Unable to connect to Redis at ${redisUrl}: ${cause.message}`);
    error.code = 'REDIS_UNAVAILABLE';
    error.cause = cause;
    throw error;
  } finally {
    redis.disconnect();
  }
}

async function runChecks () {
  const isTest = process.env.NODE_ENV === 'test';
  if (isTest) {
    logger.warn('Environment validation is running in test mode, external checks are skipped');
    return;
  }

  ensureOpenAIKey();
  const client = await ensurePostgresReady();
  try {
    await ensureWhatsAppAuthFolders(client);
  } finally {
    await client.end().catch(() => {});
  }

  await ensureRedisReady();
}

function checkEnv () {
  if (!cachedPromise) {
    cachedPromise = runChecks();
  }
  return cachedPromise;
}

if (require.main === module) {
  checkEnv()
    .then(() => {
      console.log('Environment check passed: PostgreSQL, Redis, and WhatsApp auth folders are ready.');
      process.exit(0);
    })
    .catch(error => {
      console.error(`Environment check failed: ${error.message}`);
      process.exit(1);
    });
}

module.exports = { checkEnv };
