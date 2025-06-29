//gpt-image-parser.mjs
import OpenAI from 'openai';
import fs from 'fs';
import dotenv from 'dotenv';
dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

const groupContexts = {};

export async function setupGroupContext(groupId) {
  const thread = await openai.beta.threads.create();

  groupContexts[groupId] = {
    assistantId: 'asst_Y4TquIhc5YyDLM69Qb9MtaHH',
    threadId: thread.id
  };

  return groupContexts[groupId];
}
