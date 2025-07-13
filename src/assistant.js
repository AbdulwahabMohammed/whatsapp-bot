const fs = require('fs');
const path = require('path');
const openai = require('./openai');
const pool = require('./db');

/**
 * Create an assistant for an organization.
 */
async function createAssistant(organizationId) {
  const assistant = await openai.beta.assistants.create({
    name: `Org-${organizationId}-Assistant`,
    instructions: 'رد فقط باستخدام البيانات المقدمة من الملفات المرجعية الخاصة بالمنشأة.',
    // Use file_search tool to allow the assistant to access uploaded reference
    // documents for this organization.
    tools: [{ type: 'file_search' }],
    model: 'gpt-4o',
  });

  await pool.query('UPDATE organizations SET assistant_id=$1 WHERE id=$2', [assistant.id, organizationId]);

  console.log('Assistant created:', assistant.id);
  return assistant;
}

/**
 * Upload a file and attach it to the organization assistant.
 */
async function uploadFile(organizationId, filePath) {
  const orgRes = await pool.query('SELECT assistant_id FROM organizations WHERE id=$1', [organizationId]);
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

  // Retrieve existing file IDs attached to this assistant, then append the new
  // file ID and update the assistant. This uses the supported API for
  // OpenAI SDK v5.9.0 and later.
  const assistant = await openai.beta.assistants.retrieve(org.assistant_id);
  const existingFileIds = assistant.file_ids || [];

  await openai.beta.assistants.update(org.assistant_id, {
    file_ids: [...existingFileIds, file.id],
  });

  await pool.query(
    'INSERT INTO documents (organization_id, file_id, file_name) VALUES ($1, $2, $3)',
    [organizationId, file.id, path.basename(filePath)]
  );

  console.log('File uploaded and attached:', file.id);
  return file;
}

module.exports = { createAssistant, uploadFile };
