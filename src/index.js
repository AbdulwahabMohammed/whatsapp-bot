const pool = require('./db');
const logger = require('./logger');

/**
 * Create an organization entry in the database.
 */
async function createOrganization (
  name,
  phone,
  instructions,
  language = 'ar',
  workingHoursStart,
  workingHoursEnd
) {
  const { rows } = await pool.query(
    'INSERT INTO organizations (name, phone, instructions, language, working_hours_start, working_hours_end) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
    [name, phone, instructions, language, workingHoursStart, workingHoursEnd]
  );
  return rows[0];
}

async function listOrganizations () {
  const { rows } = await pool.query('SELECT * FROM organizations');
  return rows;
}

async function main () {
  const org = await createOrganization('Acme Corp', '+123456789', null);
  logger.info('Organization created:', org);

  const orgs = await listOrganizations();
  logger.info('All organizations:', orgs);
}

if (require.main === module) {
  main().catch(err => {
    logger.error(err);
  });
}

module.exports = { createOrganization, listOrganizations };
