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

const key = process.env.OPENAI_API_KEY;
if (!key || !key.startsWith('sk-') || key.length < 40) {
  logger.error('OPENAI_API_KEY is missing or invalid');
  throw new Error('OPENAI_API_KEY is missing or invalid');
}

const openai = new OpenAI({
  apiKey: key
});

module.exports = openai;
