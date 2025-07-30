const pool = require('../db');
const logger = require('../logger');

async function generateFaq(limit = 20) {
  const { rows } = await pool.query(
    `SELECT lower(trim(text)) AS question, COUNT(*) AS count
       FROM messages
      WHERE sender='user' AND (text LIKE '%?' OR text LIKE '%؟%')
      GROUP BY question
      ORDER BY count DESC
      LIMIT $1`,
    [limit]
  );
  await pool.query('TRUNCATE faq_suggestions');
  for (const row of rows) {
    await pool.query(
      'INSERT INTO faq_suggestions (question, count) VALUES ($1,$2)',
      [row.question, row.count]
    );
  }
  logger.info('FAQ suggestions generated');
}

async function main() {
  await generateFaq();
  process.exit();
}

if (require.main === module) {
  main().catch(err => {
    logger.error('Failed to generate FAQ:', err);
    process.exit(1);
  });
}

module.exports = { generateFaq };
