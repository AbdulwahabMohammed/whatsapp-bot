const path = require('path');
const fs = require('fs');

function getAuthBaseDir () {
  return process.env.WHATSAPP_AUTH_DIR || path.join(process.cwd(), 'whatsapp-auth');
}

function getAuthPath (botId) {
  return path.join(getAuthBaseDir(), `auth-${botId}`);
}

function ensureAuthBaseDir () {
  const base = getAuthBaseDir();
  fs.mkdirSync(base, { recursive: true });
  return base;
}

module.exports = { getAuthBaseDir, getAuthPath, ensureAuthBaseDir };
