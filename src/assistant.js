const fs = require('fs');
const path = require('path');
const openai = require('./openai');
const pool = require('./db');
const logger = require('./logger');

/**
 * Create an assistant for an organization.
 */
async function createAssistant (organizationId) {
  const orgRes = await pool.query('SELECT instructions FROM organizations WHERE id=$1', [organizationId]);
  const botRes = await pool.query('SELECT * FROM bots WHERE organization_id=$1', [organizationId]);
  const org = orgRes.rows[0] || {};
  const bot = botRes.rows[0];
  const instructions =
    org.instructions ||
    'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.';

  if (bot?.assistant_id) {
    const assistant = await openai.beta.assistants.update(bot.assistant_id, {
      instructions
    });
    logger.info(`Assistant updated: ${assistant.id}`);
    return assistant;
  }

  const assistant = await openai.beta.assistants.create({
    name: `Org-${organizationId}-Assistant`,
    instructions,
    // Use file_search tool to allow the assistant to access uploaded reference
    // documents for this organization.
    tools: [{ type: 'file_search' }],
    model: 'gpt-4o'
  });

  if (bot) {
    await pool.query(
      'UPDATE bots SET assistant_id=$1, name=$2, status=$3 WHERE id=$4',
      [assistant.id, `Org-${organizationId}-Bot`, 'active', bot.id]
    );
  } else {
    await pool.query(
      'INSERT INTO bots (organization_id, assistant_id, name, status) VALUES ($1,$2,$3,$4)',
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
  const orgRes = await pool.query(
    `SELECT b.assistant_id, o.vector_store_id
     FROM organizations o
     JOIN bots b ON b.organization_id = o.id
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

  const file = await openai.files.create({
    file: fs.createReadStream(filePath),
    purpose: 'assistants'
  });

  // Determine which vector store API is available in this SDK version.
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

  // Determine the vector store for this organization.
  let vectorStoreId = org.vector_store_id;
  const assistant = await openai.beta.assistants.retrieve(org.assistant_id);
  const attachedStores = assistant.tool_resources?.file_search?.vector_store_ids || [];

  if (!vectorStoreId) {
    const vectorStore = await vectorStoresApi.create({
      name: `org-${organizationId}-store`
    });
    vectorStoreId = vectorStore.id;
    await pool.query('UPDATE organizations SET vector_store_id=$1 WHERE id=$2', [vectorStoreId, organizationId]);
  }

  if (!attachedStores.includes(vectorStoreId)) {
    await openai.beta.assistants.update(org.assistant_id, {
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
