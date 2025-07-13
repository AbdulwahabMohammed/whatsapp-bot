const pool = require('./db');

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS organizations (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      assistant_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      organization_id INTEGER REFERENCES organizations(id) ON DELETE CASCADE,
      file_id TEXT,
      file_name TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);

  console.log('Database initialized');
  process.exit();
}

init().catch(err => {
  console.error('Failed to initialize DB:', err);
  process.exit(1);
});
