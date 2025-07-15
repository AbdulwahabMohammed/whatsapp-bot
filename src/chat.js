const pool = require('./db');
const openai = require('./openai');

// Helper to retrieve a run regardless of SDK version. The OpenAI 5.x SDK
// expects the run ID as the first argument and an object containing the
// `thread_id` as the second argument. Older versions used the opposite order.
async function retrieveRun(threadId, runId) {
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

async function getOrCreateConversation(orgId, customerPhone) {
  const { rows } = await pool.query(
    'SELECT id, thread_id FROM conversations WHERE organization_id=$1 AND customer_phone=$2 ORDER BY id DESC LIMIT 1',
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

async function sendMessage(orgId, assistantId, customerPhone, text) {
  const conv = await getOrCreateConversation(orgId, customerPhone);

  // Ensure there is always a valid thread attached before continuing
  let threadId = conv.thread_id;
  if (!threadId) {
    const thread = await openai.beta.threads.create();
    threadId = thread.id;
    await pool.query('UPDATE conversations SET thread_id=$1 WHERE id=$2', [threadId, conv.id]);
  }

  await openai.beta.threads.messages.create(threadId, {
    role: 'user',
    content: text,
  });

  const run = await openai.beta.threads.runs.create(threadId, {
    assistant_id: assistantId,
  });

  let status = run.status;
  while (status !== 'completed') {
    if (['failed', 'cancelled'].includes(status)) {
      throw new Error('Run ' + run.id + ' failed with status ' + status);
    }
    await new Promise(r => setTimeout(r, 1000));

    const current = await retrieveRun(threadId, run.id);
    status = current.status;
  }

  const messages = await openai.beta.threads.messages.list(threadId, { limit: 1 });
  const reply = messages.data[0].content[0].text.value;
  return reply;
}

module.exports = { sendMessage };
