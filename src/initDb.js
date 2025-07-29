const pool = require('./db');
const logger = require('./logger');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      assistant_id TEXT,
      vector_store_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Ensure the vector_store_id column exists when upgrading an older schema
  await pool.query(
    'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vector_store_id TEXT'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      file_id TEXT,
      file_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversations (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      customer_phone TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  logger.info('Database initialized');
  process.exit();
}

init().catch(err => {
  logger.error('Failed to initialize DB:', err);
  process.exit(1);
});
