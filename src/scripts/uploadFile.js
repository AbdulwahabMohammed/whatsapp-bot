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

  const orgRes = await pool.query('SELECT assistant_id, vector_store_id FROM organizations WHERE id=$1', [orgId]);
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

  const assistant = await openai.beta.assistants.retrieve(org.assistant_id);
  let vectorStoreId = org.vector_store_id;
  const attachedStores = assistant.tool_resources?.file_search?.vector_store_ids || [];

  if (!vectorStoreId) {
    const vectorStore = await openai.beta.vectorStores.create({
      name: `org-${orgId}-store`,
    });
    vectorStoreId = vectorStore.id;
    await pool.query('UPDATE organizations SET vector_store_id=$1 WHERE id=$2', [vectorStoreId, orgId]);
  }

  if (!attachedStores.includes(vectorStoreId)) {
    await openai.beta.assistants.update(org.assistant_id, {
      tool_resources: { file_search: { vector_store_ids: [...attachedStores, vectorStoreId] } },
    });
  }

  await openai.beta.vectorStores.fileBatches.createAndPoll(vectorStoreId, {
    file_ids: [file.id],
  });

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
