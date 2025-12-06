// Some versions of the OpenAI SDK expose the client as the default export
// while others provide a named `OpenAI` export.  Try both so the project works
// across versions.
let OpenAI;
try {
  // Prefer the default export for newer SDKs
  OpenAI = require('openai').default;
  if (!OpenAI) {
    ({ OpenAI } = require('openai'));
  }
} catch (err) {
  ({ OpenAI } = require('openai'));
}
const dotenv = require('dotenv');
const logger = require('./logger');

dotenv.config();

const isTest = process.env.NODE_ENV === 'test';
const key = process.env.OPENAI_API_KEY;

if (!key || !key.startsWith('sk-') || key.length < 40) {
  if (!isTest) {
    logger.error('OPENAI_API_KEY is missing or invalid');
    throw new Error('OPENAI_API_KEY is missing or invalid');
  }

  logger.warn('OPENAI_API_KEY is not set – using mock OpenAI client in test mode');
  const mockOpenAI = {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: 'en' } }] })
      }
    },
    beta: {
      threads: {
        create: async () => ({ id: 'test-thread' }),
        messages: {
          create: async () => ({ id: 'test-message' }),
          list: async () => ({ data: [{ content: [{ text: { value: 'Test reply' } }] }] })
        },
        runs: {
          create: async () => ({ id: 'test-run', status: 'completed' }),
          retrieve: async () => ({ id: 'test-run', status: 'completed' })
        }
      }
    }
  };

  module.exports = mockOpenAI;
} else {
  const openai = new OpenAI({
    apiKey: key
  });

  module.exports = openai;
}
