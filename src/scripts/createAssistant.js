const { createAssistant } = require('../assistant');

async function main() {
  const orgId = process.argv[2];
  if (!orgId) {
    console.error('Usage: node src/scripts/createAssistant.js <organizationId>');
    process.exit(1);
  }

  await createAssistant(orgId);
}

main().catch(err => {
  console.error('Failed to create assistant:', err);
  process.exit(1);
});
