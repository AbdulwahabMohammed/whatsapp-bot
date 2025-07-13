const pool = require('./db');
const openai = require('./openai');

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

  await openai.beta.threads.messages.create(conv.thread_id, {
    role: 'user',
    content: text,
  });

  const run = await openai.beta.threads.runs.create(conv.thread_id, {
    assistant_id: assistantId,
  });

  let status = run.status;
  while (status !== 'completed') {
    if (['failed', 'cancelled'].includes(status)) {
      throw new Error('Run ' + run.id + ' failed with status ' + status);
    }
    await new Promise(r => setTimeout(r, 1000));
    const current = await openai.beta.threads.runs.retrieve(conv.thread_id, run.id);
    status = current.status;
  }

  const messages = await openai.beta.threads.messages.list(conv.thread_id, { limit: 1 });
  const reply = messages.data[0].content[0].text.value;
  return reply;
}

module.exports = { sendMessage };
