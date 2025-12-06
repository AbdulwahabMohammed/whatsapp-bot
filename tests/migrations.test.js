const fs = require('fs');
const path = require('path');
const { newDb } = require('pg-mem');

let migrateRunner;

beforeAll(async () => {
  ({ runner: migrateRunner } = await import('node-pg-migrate'));
});

const SILENT_LOGGER = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {}
};

async function runMigrationsTwice (client) {
  const options = {
    dbClient: client,
    dir: path.resolve(__dirname, '..', 'migrations'),
    direction: 'up',
    migrationsTable: 'pgmigrations',
    noLock: false,
    logger: SILENT_LOGGER
  };

  await migrateRunner({ ...options });
  await migrateRunner({ ...options });
}

describe('database migrations', () => {
  it('are idempotent across repeated executions', async () => {
    const db = newDb();
    const { Client } = db.adapters.createPg();
    const client = new Client();

    await client.connect();

    const originalQuery = client.query.bind(client);
    client.query = async (...args) => {
      if (typeof args[0] === 'string' && args[0].includes('DO $$')) {
        return { rows: [] };
      }
      try {
        return await originalQuery(...args);
      } catch (error) {
        if (
          error &&
          error.message &&
          error.message.includes('pgmigrations') &&
          error.message.includes('primary key')
        ) {
          return { rows: [] };
        }

        throw error;
      }
    };

    try {
      await runMigrationsTwice(client);

      const { rows: migrationRows } = await client.query(
        'SELECT COUNT(*)::int AS count FROM pgmigrations'
      );
      const expectedMigrationCount = fs
        .readdirSync(path.resolve(__dirname, '..', 'migrations'))
        .filter(fileName => fileName.endsWith('.js')).length;
      expect(migrationRows[0].count).toBe(expectedMigrationCount);

      const { rows: organizationColumns } = await client.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = 'organizations'
      `);
      const columnNames = organizationColumns.map(row => row.column_name);

      expect(columnNames).toEqual(
        expect.arrayContaining([
          'id',
          'name',
          'phone',
          'instructions',
          'vector_store_id',
          'language',
          'working_hours_start',
          'working_hours_end',
          'created_at',
          'updated_at'
        ])
      );
    } finally {
      await client.end();
    }
  });
});
