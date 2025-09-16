const fs = require('fs');
const path = require('path');
const logger = require('../logger');

let openai;
let openaiInitError;
try {
  openai = require('../openai');
} catch (error) {
  openaiInitError = error;
  logger.error('Failed to initialize OpenAI client for CLI upload script:', error);
}
const pool = require('../db');
const {
  SYSTEM_INSTRUCTIONS_FILTER_REASON,
  getAppliedInstructions,
  matchesSystemInstructions
} = require('../utils/systemInstructions');

function ensureOpenAIClient () {
  if (openai) {
    return openai;
  }
  const baseError = openaiInitError || new Error('OpenAI client is not initialized');
  throw new Error(`OpenAI client is not configured: ${baseError.message}`, { cause: baseError });
}

async function upload (orgId, filePath) {
  if (!orgId || !filePath) {
    throw new Error('Usage: node src/scripts/uploadFile.js <organizationId> <filePath>');
  }

  const client = ensureOpenAIClient();

  const orgRes = await pool.query(
    `SELECT b.assistant_id, o.vector_store_id, o.instructions
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

  const appliedInstructions = getAppliedInstructions(org.instructions);
  let fileContents = '';
  try {
    fileContents = await fs.promises.readFile(filePath, 'utf8');
  } catch (err) {
    logger.warn(`Failed to read file for inspection before upload: ${filePath}`, err);
  }

  if (matchesSystemInstructions(fileContents, appliedInstructions)) {
    logger.warn(
      `Skipping upload for ${filePath} because it matches system instructions for organization ${orgId}`
    );
    return { skipped: true, reason: SYSTEM_INSTRUCTIONS_FILTER_REASON };
  }

  const file = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants'
  });

  const vectorStoresApi =
    client.beta?.vectorStores ||
    client.beta?.vector_stores ||
    client.vectorStores ||
    client.vector_stores;
  if (!vectorStoresApi) {
    throw new Error(
      'This OpenAI SDK does not expose the vector store API. Please upgrade to a recent version.'
    );
  }

  const assistant = await client.beta.assistants.retrieve(org.assistant_id);
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
    await client.beta.assistants.update(org.assistant_id, {
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
