const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { Client } = require('pg');
const logger = require('./logger');
const { createRedisClient, redisUrl } = require('./redisConfig');

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

function hasAuthFolder (botId) {
  const cwd = process.cwd();
  const authPaths = [
    path.join(cwd, `auth-${botId}`),
    path.join(cwd, 'auth', String(botId))
  ];

  return authPaths.some(folderPath => fs.existsSync(folderPath));
}

async function ensureWhatsAppAuthFolders (client) {
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

  const missing = rows.filter(row => !hasAuthFolder(row.id));
  if (!missing.length) {
    return;
  }

  const missingLabels = missing
    .map(bot => (bot.name ? `${bot.name} (#${bot.id})` : bot.phone ? `${bot.phone} (#${bot.id})` : `bot #${bot.id}`))
    .join(', ');
  const missingFolders = missing.map(bot => `auth-${bot.id}`).join(', ');
  const error = new Error(
    `Missing WhatsApp auth folders (${missingFolders}). Ensure each bot session is mounted before starting the worker. Affected bots: ${missingLabels}.`
  );
  error.code = 'WHATSAPP_AUTH_MISSING';
  error.missingBots = missing.map(bot => bot.id);
  throw error;
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
