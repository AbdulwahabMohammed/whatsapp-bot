const ORIGINAL_ENV = { ...process.env };

describe('database configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it('creates pool when required env vars are set', () => {
    process.env.PGHOST = 'localhost';
    process.env.PGUSER = 'user';
    process.env.PGDATABASE = 'db';
    process.env.PGPASSWORD = 'pass';
    process.env.PGPORT = '5432';

    const mockPoolInstance = {};
    jest.doMock('pg', () => ({ Pool: jest.fn(() => mockPoolInstance) }));

    const pool = require('../src/db');
    const { Pool } = require('pg');

    expect(Pool).toHaveBeenCalledWith({
      host: 'localhost',
      user: 'user',
      database: 'db',
      password: 'pass',
      port: '5432'
    });
    expect(pool).toBe(mockPoolInstance);
  });

  it('throws error when PGHOST is missing', () => {
    delete process.env.PGHOST;
    process.env.PGUSER = 'user';
    process.env.PGDATABASE = 'db';
    process.env.PGPASSWORD = 'pass';
    process.env.PGPORT = '5432';

    jest.doMock('pg', () => ({ Pool: jest.fn() }));

    expect(() => require('../src/db')).toThrow('Missing PGHOST environment variable');
  });
});
