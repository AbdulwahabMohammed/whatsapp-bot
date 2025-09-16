const logger = require('./logger');
const pool = require('./db');

const FAST_DEV = process.env.FAST_DEV === 'true';
const DETECT_LANGUAGE_DISABLED = process.env.DETECT_LANGUAGE === 'false';

function isUnset (value) {
  return value === undefined || value === null || value === '';
}

function resolveIntEnv (name, defaultValue, devDefault) {
  const raw = process.env[name];
  const fallback = FAST_DEV && isUnset(raw) ? devDefault : defaultValue;
  const parsed = parseInt(raw, 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveFloatEnv (name, defaultValue, devDefault) {
  const raw = process.env[name];
  const fallback = FAST_DEV && isUnset(raw) ? devDefault : defaultValue;
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const RUN_MAX_RETRIES = resolveIntEnv('RUN_MAX_RETRIES', 60, 20);
const RUN_INITIAL_DELAY_MS = resolveIntEnv('RUN_INITIAL_DELAY_MS', 1000, 300);
const RUN_MAX_DELAY_MS = resolveIntEnv('RUN_MAX_DELAY_MS', 5000, 1500);
const RUN_DELAY_GROWTH = resolveFloatEnv('RUN_DELAY_GROWTH', 1.2, 1.15);

let openai;
let openaiInitError;
try {
  openai = require('./openai');
} catch (error) {
  openaiInitError = error;
  logger.error('Failed to initialize OpenAI client for chat module:', error);
}
const { getAppliedInstructions, matchesSystemInstructions } = require('./utils/systemInstructions');

const SYSTEM_INSTRUCTIONS_FALLBACK_REPLY = 'عذرًا، لا يمكنني مشاركة هذه التعليمات.';

async function checkUsageLimit (orgId) {
  const limit = parseInt(process.env.DAILY_TOKEN_LIMIT || '0', 10);
  if (!limit) return;
  const { rows } = await pool.query(
    'SELECT COALESCE(SUM(tokens_prompt + tokens_completion),0) AS tokens FROM usage_stats WHERE organization_id=$1 AND created_at >= CURRENT_DATE',
    [orgId]
  );
  const used = parseInt(rows[0].tokens, 10);
  if (used > limit) {
    logger.warn(`Organization ${orgId} exceeded daily token limit (${used}/${limit})`);
  }
}

// Helper to retrieve a run regardless of SDK version. The OpenAI 5.x SDK
// expects the run ID as the first argument and an object containing the
// `thread_id` as the second argument. Older versions used the opposite order.
async function retrieveRun (threadId, runId) {
  if (!openai) {
    const error = openaiInitError || new Error('OpenAI client is not initialized');
    throw error;
  }
  if (!threadId) {
    throw new Error('threadId is required to retrieve a run');
  }
  try {
    return await openai.beta.threads.runs.retrieve(runId, { thread_id: threadId });
  } catch (err) {
    // Fallback for very old SDKs (pre 5.x)
    return await openai.beta.threads.runs.retrieve(threadId, runId);
  }
}

async function getOrCreateConversation (orgId, customerPhone) {
  const { rows } = await pool.query(
    'SELECT id, thread_id, escalated, detected_language, summary FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
    [orgId, customerPhone]
  );
  if (rows[0]) return rows[0];

  const thread = await openai.beta.threads.create();
  const insert = await pool.query(
    'INSERT INTO conversations (organization_id, customer_phone, thread_id) VALUES ($1, $2, $3) RETURNING *',
    [orgId, customerPhone, thread.id]
  );
  return insert.rows[0];
}

async function sendMessage (orgId, assistantId, customerPhone, text) {
  if (!text || !String(text).trim()) {
    logger.warn('Empty text provided to sendMessage, skipping OpenAI call');
    return null;
  }
  if (!openai) {
    logger.error('OpenAI client not initialized; unable to send chat message.', openaiInitError);
    return null;
  }
  const conv = await getOrCreateConversation(orgId, customerPhone);

  if (conv.escalated) {
    return null;
  }

  // Ensure there is always a valid thread attached before continuing
  let threadId = conv.thread_id;
  if (!threadId) {
    const thread = await openai.beta.threads.create();
    threadId = thread.id;
    await pool.query('UPDATE conversations SET thread_id=$1 WHERE id=$2', [threadId, conv.id]);
  }

  // Detect language on first message
  if (!DETECT_LANGUAGE_DISABLED && !conv.detected_language) {
    try {
      const resp = await openai.chat.completions.create({
        model: 'gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'Detect the language of the following text. Reply with the ISO 639-1 code only.' },
          { role: 'user', content: text }
        ]
      });
      const code = resp.choices?.[0]?.message?.content?.trim().toLowerCase();
      if (code) {
        await pool.query('UPDATE conversations SET detected_language=$1 WHERE id=$2', [code, conv.id]);
        conv.detected_language = code;
      }
    } catch (e) {
      logger.warn('Language detection failed:', e);
    }
  }

  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: text
  });

  const { rows } = await pool.query('SELECT language, instructions FROM organizations WHERE id=$1', [orgId]);
  const orgConfig = rows[0] || {};
  const orgLang = orgConfig.language || 'ar';
  const lang = conv.detected_language || orgLang;
  const appliedInstructions = getAppliedInstructions(orgConfig.instructions);

  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
    instructions: `Please respond in ${lang}`
  });

  let status = run.status;
  const MAX_RETRIES = RUN_MAX_RETRIES; // upper bound on how many status checks to perform
  let delay = RUN_INITIAL_DELAY_MS;
  const MAX_DELAY = RUN_MAX_DELAY_MS;
  const DELAY_GROWTH = RUN_DELAY_GROWTH;
  let attempts = 0;
  while (status !== 'completed') {
    if (['failed', 'cancelled'].includes(status)) {
      throw new Error('Run ' + run.id + ' failed with status ' + status);
    }
    if (attempts >= MAX_RETRIES) {
      throw new Error('Run ' + run.id + ' did not complete after maximum retries');
    }
    await new Promise(resolve => setTimeout(resolve, delay));

    const current = await retrieveRun(threadId, run.id);
    status = current.status;
    attempts++;
    delay = Math.min(MAX_DELAY, Math.floor(delay * DELAY_GROWTH));
  }

  const completedRun = await retrieveRun(threadId, run.id);

  if (completedRun.usage) {
    await pool.query(
      'INSERT INTO usage_stats (organization_id, tokens_prompt, tokens_completion) VALUES ($1,$2,$3)',
      [
        orgId,
        completedRun.usage.prompt_tokens || 0,
        completedRun.usage.completion_tokens || 0
      ]
    );
    await checkUsageLimit(orgId);
  }

  const messages = await openai.beta.threads.messages.list(threadId, { limit: 1 });
  let reply = messages.data[0].content[0].text.value;

  if (matchesSystemInstructions(reply, appliedInstructions)) {
    logger.warn(`Filtered system instructions from assistant reply for organization ${orgId}`);
    reply = SYSTEM_INSTRUCTIONS_FALLBACK_REPLY;
  }

  return reply;
}

module.exports = { sendMessage };
