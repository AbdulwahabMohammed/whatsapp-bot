const fs = require('fs');
const path = require('path');
const logger = require('./logger');

let openai;
let openaiInitError;
try {
  openai = require('./openai');
} catch (error) {
  openaiInitError = error;
  logger.error('Failed to initialize OpenAI client for assistant module:', error);
}
const pool = require('./db');
const {
  SYSTEM_INSTRUCTIONS_FILTER_REASON,
  getAppliedInstructions,
  matchesSystemInstructions
} = require('./utils/systemInstructions');

function getOpenAIClient (context) {
  if (openai) {
    return openai;
  }
  const baseError = openaiInitError || new Error('OpenAI client is not initialized');
  logger.error(`OpenAI client unavailable for assistant ${context}.`, baseError);
  return null;
}

/**
 * Create an assistant for an organization.
 */
async function createAssistant (organizationId) {
  const client = getOpenAIClient('create');
  if (!client) {
    return null;
  }
  const orgRes = await pool.query('SELECT instructions FROM organizations WHERE id=$1', [organizationId]);
  const botRes = await pool.query('SELECT * FROM whatsapp_bots WHERE organization_id=$1', [organizationId]);
  const org = orgRes.rows[0] || {};
  const bot = botRes.rows[0];
  const instructions =
    org.instructions ||
    'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.';

  if (bot?.assistant_id) {
    const assistant = await client.beta.assistants.update(bot.assistant_id, {
      instructions
    });
    logger.info(`Assistant updated: ${assistant.id}`);
    return assistant;
  }

  const assistant = await client.beta.assistants.create({
    name: `Org-${organizationId}-Assistant`,
    instructions,
    // Use file_search tool to allow the assistant to access uploaded reference
    // documents for this organization.
    tools: [{ type: 'file_search' }],
    model: 'gpt-4o'
  });

  if (bot) {
    await pool.query(
      'UPDATE whatsapp_bots SET assistant_id=$1, name=$2, status=$3, updated_at=NOW() WHERE id=$4',
      [assistant.id, `Org-${organizationId}-Bot`, 'active', bot.id]
    );
  } else {
    await pool.query(
      'INSERT INTO whatsapp_bots (organization_id, assistant_id, name, status) VALUES ($1,$2,$3,$4)',
      [organizationId, assistant.id, `Org-${organizationId}-Bot`, 'active']
    );
  }

  logger.info(`Assistant created: ${assistant.id}`);
  return assistant;
}

/**
 * Upload a file and attach it to the organization assistant.
 */
async function uploadFile (organizationId, filePath) {
  const client = getOpenAIClient('upload');
  if (!client) {
    return null;
  }
  const orgRes = await pool.query(
    `SELECT b.assistant_id, o.vector_store_id, o.instructions
     FROM organizations o
     JOIN whatsapp_bots b ON b.organization_id = o.id
     WHERE o.id=$1`,
    [organizationId]
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
      `Skipping upload for ${filePath} because it matches system instructions for organization ${organizationId}`
    );
    return { skipped: true, reason: SYSTEM_INSTRUCTIONS_FILTER_REASON };
  }

  const file = await client.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants'
  });

  // Determine which vector store API is available in this SDK version.
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

  // Determine the vector store for this organization.
  let vectorStoreId = org.vector_store_id;
  const assistant = await client.beta.assistants.retrieve(org.assistant_id);
  const attachedStores = assistant.tool_resources?.file_search?.vector_store_ids || [];

  // Verify the vector store exists; recreate if missing
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
      name: `org-${organizationId}-store`
    });
    vectorStoreId = vectorStore.id;
    await pool.query('UPDATE organizations SET vector_store_id=$1 WHERE id=$2', [vectorStoreId, organizationId]);
  }

  if (!attachedStores.includes(vectorStoreId)) {
    await client.beta.assistants.update(org.assistant_id, {
      tool_resources: { file_search: { vector_store_ids: [...attachedStores, vectorStoreId] } }
    });
  }

  // Upload the file to the vector store and wait for indexing
  await vectorStoresApi.fileBatches.createAndPoll(vectorStoreId, {
    file_ids: [file.id]
  });

  await pool.query(
    'INSERT INTO documents (organization_id, file_id, file_name) VALUES ($1, $2, $3)',
    [organizationId, file.id, path.basename(filePath)]
  );

  logger.info(`File uploaded and attached: ${file.id}`);
  return file;
}

module.exports = { createAssistant, uploadFile };
