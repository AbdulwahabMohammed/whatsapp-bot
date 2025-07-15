const OpenAIImport = require('openai');
const OpenAI = OpenAIImport.default || OpenAIImport;
const dotenv = require('dotenv');

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = openai;
