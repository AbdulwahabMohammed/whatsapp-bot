const pool = require('./db');
const logger = require('./logger');
const bcrypt = require('bcrypt');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      instructions TEXT,
      assistant_id TEXT,
      vector_store_id TEXT,
      language TEXT DEFAULT 'ar',
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  // Ensure the vector_store_id column exists when upgrading an older schema
  await pool.query(
    'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS vector_store_id TEXT'
  );

  await pool.query(
    'ALTER TABLE organizations ADD COLUMN IF NOT EXISTS instructions TEXT'
  );

  await pool.query(
    "ALTER TABLE organizations ADD COLUMN IF NOT EXISTS language TEXT DEFAULT 'ar'"
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
      detected_language TEXT,
      summary TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(
    'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS detected_language TEXT'
  );

  await pool.query(
    'ALTER TABLE conversations ADD COLUMN IF NOT EXISTS summary TEXT'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      text TEXT,
      attachment_type TEXT,
      attachment_path TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(
    'ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_type TEXT'
  );
  await pool.query(
    'ALTER TABLE messages ADD COLUMN IF NOT EXISTS attachment_path TEXT'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS scheduled_messages (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      text TEXT NOT NULL,
      send_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS usage_stats (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      tokens_prompt INTEGER NOT NULL,
      tokens_completion INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS conversation_stats (
      id SERIAL PRIMARY KEY,
      conversation_id INTEGER REFERENCES conversations(id) ON DELETE CASCADE,
      response_time_ms INTEGER NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      totp_secret TEXT
    );
  `);

  await pool.query(
    "ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'admin'"
  );

  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS totp_secret TEXT'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_messages_conversation_id ON messages(conversation_id)'
  );

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_conversations_customer_phone ON conversations(customer_phone)'
  );

  if (process.env.ADMIN_PASSWORD) {
    const hash = await bcrypt.hash(process.env.ADMIN_PASSWORD, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1, $2, $3)\n        ON CONFLICT (username) DO UPDATE SET password_hash = EXCLUDED.password_hash, role = EXCLUDED.role',
      ['admin', hash, 'admin']
    );
  }

  logger.info('Database initialized');
  process.exit();
}

init().catch(err => {
  logger.error('Failed to initialize DB:', err);
  process.exit(1);
});
