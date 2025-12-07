const pool = require('./db');
const logger = require('./logger');
const { slugify } = require('./utils/slugify');

async function seedDemo () {
  const client = await pool.connect();
  const orgSlug = 'org-1';
  const botName = 'Org-1-Bot';

  try {
    await client.query('BEGIN');

    const orgResult = await client.query(
      `INSERT INTO organizations (name, slug, status)
       VALUES ($1, $2, $3)
       ON CONFLICT (slug) DO UPDATE
       SET name = EXCLUDED.name,
           status = EXCLUDED.status,
           updated_at = now()
       RETURNING id, name, slug, status`,
      ['Org-1', slugify(orgSlug), 'active']
    );
    const organization = orgResult.rows[0];
    logger.info(`Seeded organization ${organization.slug}`, organization);

    const botResult = await client.query(
      `INSERT INTO whatsapp_bots (organization_id, assistant_id, name, phone, status)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (organization_id, name) DO UPDATE
       SET phone = EXCLUDED.phone,
           status = EXCLUDED.status,
           updated_at = now()
       RETURNING id, name, status`,
      [organization.id, 'demo-assistant', botName, '0000000000000', 'stopped']
    );
    const bot = botResult.rows[0];
    logger.info(`Seeded bot ${bot.name}`, bot);

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Demo seed failed', error);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

if (require.main === module) {
  seedDemo().then(() => {
    if (!process.exitCode) {
      logger.info('Demo seed completed');
    }
  });
}

module.exports = { seedDemo };
