const logger = require('./logger');
const { checkEnv } = require('./checkEnv');
const { slugify } = require('./utils/slugify');

const envCheckPromise = checkEnv();
let pool;

function getPool () {
  if (!pool) {
    // Lazy-load the database connection so the environment check can fail gracefully first.
    pool = require('./db');
  }
  return pool;
}

/**
 * Create an organization entry in the database.
 */
async function createOrganization (
  name,
  phone,
  instructions,
  language = 'ar',
  workingHoursStart,
  workingHoursEnd,
  slug,
  status = 'active',
  contactEmail,
  contactPhone,
  description
) {
  await envCheckPromise;
  const db = getPool();
  const normalizedSlug = slugify(slug || name) || `org-${Date.now()}`;
  const { rows } = await db.query(
    'INSERT INTO organizations (name, phone, instructions, language, working_hours_start, working_hours_end, slug, status, contact_email, contact_phone, description) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *',
    [
      name,
      phone,
      instructions,
      language,
      workingHoursStart,
      workingHoursEnd,
      normalizedSlug,
      status,
      contactEmail,
      contactPhone,
      description
    ]
  );
  return rows[0];
}

async function listOrganizations () {
  await envCheckPromise;
  const db = getPool();
  const { rows } = await db.query('SELECT * FROM organizations ORDER BY created_at DESC');
  return rows;
}

async function main () {
  const org = await createOrganization('Acme Corp', '+123456789', null);
  logger.info('Organization created:', org);

  const orgs = await listOrganizations();
  logger.info('All organizations:', orgs);
}

async function start () {
  try {
    await envCheckPromise;
  } catch (error) {
    logger.error(`Environment validation failed: ${error.message}`, { stack: error.stack });
    process.exit(1);
    return;
  }

  try {
    await main();
  } catch (err) {
    logger.error('Failed to create/list organizations', { error: err.message, stack: err.stack });
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { createOrganization, listOrganizations, start };
