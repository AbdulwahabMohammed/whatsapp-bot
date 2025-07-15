// Use the default export so beta features like vector stores are available
// in all supported versions of the OpenAI SDK.
const OpenAI = require('openai').default;
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = openai;
