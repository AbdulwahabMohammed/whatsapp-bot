const fs = require('fs');
const path = require('path');
const openai = require('../openai');
const pool = require('../db');
const logger = require('../logger');

async function upload (orgId, filePath) {
  if (!orgId || !filePath) {
    throw new Error('Usage: node src/scripts/uploadFile.js <organizationId> <filePath>');
  }

  const orgRes = await pool.query(
    `SELECT b.assistant_id, o.vector_store_id
     FROM organizations o
     JOIN bots b ON b.organization_id = o.id
     WHERE o.id=$1`,
    [orgId]
  );
  const org = orgRes.rows[0];
  if (!org) {
    throw new Error('Organization not found');
  }
  if (!org.assistant_id) {
    throw new Error('Organization does not have an assistant');
  }

  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants'
  });

  const vectorStoresApi =
    openai.beta?.vectorStores ||
    openai.beta?.vector_stores ||
    openai.vectorStores ||
    openai.vector_stores;
  if (!vectorStoresApi) {
    throw new Error(
      'This OpenAI SDK does not expose the vector store API. Please upgrade to a recent version.'
    );
  }

  const assistant = await openai.beta.assistants.retrieve(org.assistant_id);
  let vectorStoreId = org.vector_store_id;
  const attachedStores = assistant.tool_resources?.file_search?.vector_store_ids || [];

  // Ensure existing vector store still exists; recreate on 404
  if (vectorStoreId) {
    try {
      await vectorStoresApi.retrieve(vectorStoreId);
    } catch (err) {
      if (err.status === 404) {
        vectorStoreId = null;
      } else {
        throw err;
      }
    }
  }

  if (!vectorStoreId) {
    const vectorStore = await vectorStoresApi.create({
      name: `org-${orgId}-store`
    });
    vectorStoreId = vectorStore.id;
    await pool.query('UPDATE organizations SET vector_store_id=$1 WHERE id=$2', [vectorStoreId, orgId]);
  }

  if (!attachedStores.includes(vectorStoreId)) {
    await openai.beta.assistants.update(org.assistant_id, {
      tool_resources: { file_search: { vector_store_ids: [...attachedStores, vectorStoreId] } }
    });
  }

  await vectorStoresApi.fileBatches.createAndPoll(vectorStoreId, {
    file_ids: [file.id]
  });

  await pool.query(
    'INSERT INTO documents (organization_id, file_id, file_name) VALUES ($1, $2, $3)',
    [orgId, file.id, path.basename(filePath)]
  );

  logger.info(`File uploaded and attached: ${file.id}`);
}

async function main () {
  const orgId = process.argv[2];
  const filePath = process.argv[3];
  await upload(orgId, filePath);
}

if (require.main === module) {
  main().catch(err => {
    logger.error('Failed to upload file:', err);
    process.exit(1);
  });
}

module.exports = { upload };
