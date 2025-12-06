const pool = require('../db');
const logger = require('../logger');

async function migrate () {
  await pool.query(
    'ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id BIGINT REFERENCES organizations(id)'
  );

  await pool.query(`
    CREATE TABLE IF NOT EXISTS whatsapp_bots (
      id BIGSERIAL PRIMARY KEY,
      organization_id BIGINT REFERENCES organizations(id) ON DELETE CASCADE,
      assistant_id TEXT,
      name TEXT,
      phone TEXT,
      status TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
    );
  `);

  await pool.query(
    'CREATE INDEX IF NOT EXISTS idx_bots_organization_id ON whatsapp_bots(organization_id)'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_assistant_id ON whatsapp_bots(assistant_id)'
  );
  await pool.query(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_bots_phone ON whatsapp_bots(phone)'
  );

  await pool.query(`
    INSERT INTO whatsapp_bots (organization_id, assistant_id, name, phone, status)
    SELECT id, assistant_id, name, phone, 'active'
    FROM organizations
    WHERE assistant_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM whatsapp_bots b WHERE b.organization_id = organizations.id
      )
  `);

  await pool.query('ALTER TABLE organizations DROP COLUMN IF EXISTS assistant_id');

  logger.info('Migration completed');
  process.exit();
}

migrate().catch(err => {
  logger.error('Migration failed:', err);
  process.exit(1);
});
