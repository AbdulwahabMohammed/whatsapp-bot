const path = require('path');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { runner } = require('node-pg-migrate');

const pool = require('./db');
const logger = require('./logger');

async function runMigrations () {
  const client = new Client({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: process.env.PGPORT
  });

  await client.connect();

  try {
    await runner({
      dbClient: client,
      dir: path.resolve(__dirname, '..', 'migrations'),
      direction: 'up',
      noLock: false,
      migrationsTable: 'pgmigrations',
      logger
    });
  } finally {
    await client.end();
  }
}

async function ensureAdminUser () {
  if (!process.env.ADMIN_PASSWORD) {
    return;
  }

  const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
  await pool.query(
    `INSERT INTO users (username, password_hash, role)
     VALUES ($1, $2, $3)
     ON CONFLICT (username)
     DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role`,
    ['admin', hash, 'admin']
  );
}

async function init () {
  await runMigrations();
  await ensureAdminUser();
}

async function closePool () {
  try {
    await pool.end();
    logger.info('Database pool closed');
  } catch (closeError) {
    logger.error('Failed to close database pool:', closeError);
    if (!process.exitCode) {
      process.exitCode = 1;
    }
  }
}

async function main () {
  try {
    await init();
    logger.info('Database initialized');
  } catch (error) {
    logger.error('Failed to initialize DB:', error);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  init,
  runMigrations,
  ensureAdminUser,
  closePool,
  main
};
