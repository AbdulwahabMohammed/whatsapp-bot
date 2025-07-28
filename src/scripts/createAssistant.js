const { createAssistant } = require('../assistant');
const logger = require('../logger');

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    logger.error('Usage: node src/scripts/createAssistant.js <organizationId>');
    process.exit(1);
  }

  await createAssistant(orgId);
}

main().catch(err => {
  logger.error('Failed to create assistant:', err);
  process.exit(1);
});
