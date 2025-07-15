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

dotenv.config();

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

module.exports = openai;
