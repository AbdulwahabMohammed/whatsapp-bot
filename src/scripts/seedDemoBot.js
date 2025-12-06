const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

function createPool () {
  const port = process.env.PGPORT ? parseInt(process.env.PGPORT, 10) : 5432;

  return new Pool({
    host: process.env.PGHOST,
    user: process.env.PGUSER,
    database: process.env.PGDATABASE,
    password: process.env.PGPASSWORD,
    port: Number.isNaN(port) ? 5432 : port
  });
}

async function seedDemoBot () {
  const pool = createPool();

  try {
    await pool.query('SELECT 1');
    console.log('Connected to Postgres');

    const orgResult = await pool.query(
      `INSERT INTO organizations (name, created_at, updated_at)
       VALUES ($1, NOW(), NOW())
       ON CONFLICT (name) DO UPDATE
         SET updated_at = EXCLUDED.updated_at
       RETURNING id`,
      ['Demo Organization']
    );
    const organizationId = orgResult.rows[0].id;
    console.log(`Organization ID: ${organizationId}`);

    const botResult = await pool.query(
      `INSERT INTO bots (organization_id, assistant_id, name, phone, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
       ON CONFLICT (assistant_id) DO UPDATE
         SET organization_id = EXCLUDED.organization_id,
             name = EXCLUDED.name,
             phone = EXCLUDED.phone,
             status = EXCLUDED.status,
             updated_at = EXCLUDED.updated_at
       RETURNING id`,
      [
        organizationId,
        'demo-assistant',
        'Demo WhatsApp Bot',
        '+10000000000',
        'active'
      ]
    );
    const botId = botResult.rows[0].id;
    console.log(`Bot ID: ${botId}`);

    console.log('Demo seed completed successfully');
  } catch (error) {
    console.error('Seed failed:', error);
    process.exitCode = 1;
  } finally {
    await pool.end();
    console.log('Postgres pool closed');
  }
}

seedDemoBot();
