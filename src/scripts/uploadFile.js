const fs = require('fs');
const path = require('path');
const mime = require('mime-types');
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

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const ALLOWED_FILE_TYPES = {
  '.txt': ['text/plain'],
  '.md': ['text/markdown', 'text/plain'],
  '.markdown': ['text/markdown', 'text/plain'],
  '.pdf': ['application/pdf'],
  '.csv': ['text/csv', 'application/vnd.ms-excel'],
  '.json': ['application/json'],
  '.docx': ['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

function formatFileSize (bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatAllowedFileTypes () {
  return Object.entries(ALLOWED_FILE_TYPES)
    .map(([ext, mimes]) => `${ext} (${mimes.join(', ')})`)
    .join(', ');
}

function createValidationError (message) {
  const error = new Error(message);
  error.statusCode = 400;
  error.name = 'UploadValidationError';
  return error;
}

async function validateFilePath (inputPath) {
  const resolvedPath = path.resolve(inputPath);
  let stats;
  try {
    stats = await fs.promises.stat(resolvedPath);
  } catch (err) {
    if (err && err.code === 'ENOENT') {
      throw createValidationError(`File not found at path: ${resolvedPath}`);
    }
    throw createValidationError(`Unable to access file: ${resolvedPath}`);
  }

  if (typeof stats.isFile !== 'function' || !stats.isFile()) {
    throw createValidationError(`The provided path is not a file: ${resolvedPath}`);
  }

  if (stats.size > MAX_FILE_SIZE_BYTES) {
    throw createValidationError(
      `File size ${formatFileSize(stats.size)} exceeds the maximum allowed ${formatFileSize(MAX_FILE_SIZE_BYTES)}.`
    );
  }

  const extension = path.extname(resolvedPath).toLowerCase();
  const allowedMimes = ALLOWED_FILE_TYPES[extension];
  if (!allowedMimes) {
    throw createValidationError(
      `Unsupported file extension "${extension || 'unknown'}". Allowed types: ${formatAllowedFileTypes()}.`
    );
  }

  const detectedMime = mime.lookup(resolvedPath);
  if (!detectedMime) {
    throw createValidationError(
      `Unable to determine MIME type for ${path.basename(resolvedPath)}. Supported types: ${formatAllowedFileTypes()}.`
    );
  }

  if (!allowedMimes.includes(detectedMime)) {
    throw createValidationError(
      `Detected MIME type "${detectedMime}" is not allowed for extension ${extension}. Supported types: ${allowedMimes.join(
        ', '
      )}.`
    );
  }

  return resolvedPath;
}

async function upload (orgId, filePath) {
  if (!orgId || !filePath) {
    throw new Error('Usage: node src/scripts/uploadFile.js <organizationId> <filePath>');
  }

  const normalizedPath = await validateFilePath(filePath);
  const client = ensureOpenAIClient();

  const orgRes = await pool.query(
    `SELECT b.assistant_id, o.vector_store_id, o.instructions
     FROM organizations o
     JOIN whatsapp_bots b ON b.organization_id = o.id
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
    fileContents = await fs.promises.readFile(normalizedPath, 'utf8');
  } catch (err) {
    logger.warn(`Failed to read file for inspection before upload: ${normalizedPath}`, err);
  }

  if (matchesSystemInstructions(fileContents, appliedInstructions)) {
    logger.warn(
      `Skipping upload for ${normalizedPath} because it matches system instructions for organization ${orgId}`
    );
    return { skipped: true, reason: SYSTEM_INSTRUCTIONS_FILTER_REASON };
  }

  const file = await client.files.create({
    file: fs.createReadStream(normalizedPath),
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
    [orgId, file.id, path.basename(normalizedPath)]
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

module.exports = {
  upload,
  ALLOWED_FILE_TYPES,
  MAX_FILE_SIZE_BYTES,
  validateFilePath,
  formatAllowedFileTypes,
  formatFileSize
};
