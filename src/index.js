const pool = require('./db');
const openai = require('./openai');

/**
 * Create an organization and optionally an assistant in OpenAI.
 */
async function createOrganization(name, phone) {
  const { rows } = await pool.query(
    'INSERT INTO organizations (name, phone) VALUES ($1, $2) RETURNING *',
    [name, phone]
  );
  return rows[0];
}

async function listOrganizations() {
  const { rows } = await pool.query('SELECT * FROM organizations');
  return rows;
}

async function main() {
  const org = await createOrganization('Acme Corp', '+123456789');
  console.log('Organization created:', org);

  const orgs = await listOrganizations();
  console.log('All organizations:', orgs);
}

main().catch(err => {
  console.error(err);
});
