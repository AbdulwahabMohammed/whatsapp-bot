const { uploadFile } = require('../assistant');

async function main() {
  const orgId = process.argv[2];
  const filePath = process.argv[3];
  if (!orgId || !filePath) {
    console.error('Usage: node src/scripts/uploadFile.js <organizationId> <filePath>');
    process.exit(1);
  }

  await uploadFile(orgId, filePath);
}

main().catch(err => {
  console.error('Failed to upload file:', err);
  process.exit(1);
});
