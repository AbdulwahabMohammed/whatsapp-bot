const { Pool } = require('pg');
const dotenv = require('dotenv');

dotenv.config();

const requiredEnv = ['PGHOST', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGPORT'];

for (const name of requiredEnv) {
  if (!process.env[name]) {
    throw new Error(`Missing ${name} environment variable`);
  }
}

const pool = new Pool({
  host: process.env.PGHOST,
  user: process.env.PGUSER,
  database: process.env.PGDATABASE,
  password: process.env.PGPASSWORD,
  port: process.env.PGPORT
});

module.exports = pool;
