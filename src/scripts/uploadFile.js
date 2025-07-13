const fs = require('fs');
const path = require('path');
const openai = require('../openai');
const pool = require('../db');

async function main() {
  const orgId = process.argv[2];
  const filePath = process.argv[3];
  if (!orgId || !filePath) {
    console.error('Usage: node src/scripts/uploadFile.js <organizationId> <filePath>');
    process.exit(1);
  }

  const orgRes = await pool.query('SELECT assistant_id FROM organizations WHERE id=$1', [orgId]);
  const org = orgRes.rows[0];
  if (!org) {
    throw new Error('Organization not found');
  }
  if (!org.assistant_id) {
    throw new Error('Organization does not have an assistant');
  }

  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants',
  });

  if (openai.beta.assistants.files?.create) {
    await openai.beta.assistants.files.create(org.assistant_id, { file_id: file.id });
  } else {
    const current = await openai.beta.assistants.retrieve(org.assistant_id);
    const fileIds = current.file_ids || [];
    await openai.beta.assistants.update(org.assistant_id, {
      file_ids: [...fileIds, file.id],
    });
  }

  await pool.query(
    'INSERT INTO documents (organization_id, file_id, file_name) VALUES ($1, $2, $3)',
    [orgId, file.id, path.basename(filePath)]
  );

  console.log('File uploaded and attached:', file.id);
}

main().catch(err => {
  console.error('Failed to upload file:', err);
  process.exit(1);
});
