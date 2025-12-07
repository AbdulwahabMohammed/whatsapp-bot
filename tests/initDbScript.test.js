const ORIGINAL_ENV = { ...process.env };

describe('initDb script', () => {
  beforeEach(() => {
    jest.resetModules();
    process.exitCode = undefined;
    process.env = {
      ...ORIGINAL_ENV,
      PGHOST: 'localhost',
      PGUSER: 'user',
      PGDATABASE: 'db',
      PGPASSWORD: 'pass',
      PGPORT: '5432',
      ADMIN_PASSWORD: 'secret'
    };
  });

  afterEach(() => {
    jest.resetAllMocks();
    process.env = ORIGINAL_ENV;
  });

  it('closes the pool after a successful run', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined)
    };
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    const runner = jest.fn().mockResolvedValue([]);
    const hash = jest.fn().mockResolvedValue('hashed');
    const clientConnect = jest.fn().mockResolvedValue(undefined);
    const clientEnd = jest.fn().mockResolvedValue(undefined);
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });

    jest.doMock('../src/db', () => pool);
    jest.doMock('../src/logger', () => logger);
    jest.doMock('bcrypt', () => ({ hash }));
    jest.doMock('node-pg-migrate', () => ({ runner }));
    jest.doMock('pg', () => ({ Client: jest.fn(() => ({ connect: clientConnect, end: clientEnd, query: clientQuery })) }));

    let initDb;
    jest.isolateModules(() => {
      initDb = require('../src/initDb');
    });

    await initDb.main();

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS pgmigrations'));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(clientConnect).toHaveBeenCalledTimes(1);
    expect(clientEnd).toHaveBeenCalledTimes(1);
    expect(pool.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO users'),
      ['admin', 'hashed', 'admin']
    );
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(logger.info).toHaveBeenCalledWith('Database pool closed');
    expect(process.exitCode).toBeUndefined();
  });

  it('still closes the pool when migrations fail', async () => {
    const pool = {
      query: jest.fn().mockResolvedValue(undefined),
      end: jest.fn().mockResolvedValue(undefined)
    };
    const logger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    const runnerError = new Error('runner failed');
    const runner = jest.fn().mockRejectedValue(runnerError);
    const clientConnect = jest.fn().mockResolvedValue(undefined);
    const clientEnd = jest.fn().mockResolvedValue(undefined);
    const clientQuery = jest.fn().mockResolvedValue({ rows: [] });

    jest.doMock('../src/db', () => pool);
    jest.doMock('../src/logger', () => logger);
    jest.doMock('bcrypt', () => ({ hash: jest.fn().mockResolvedValue('hashed') }));
    jest.doMock('node-pg-migrate', () => ({ runner }));
    jest.doMock('pg', () => ({ Client: jest.fn(() => ({ connect: clientConnect, end: clientEnd, query: clientQuery })) }));

    let initDb;
    jest.isolateModules(() => {
      initDb = require('../src/initDb');
    });

    await initDb.main();

    expect(clientQuery).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE IF NOT EXISTS pgmigrations'));
    expect(runner).toHaveBeenCalledTimes(1);
    expect(clientConnect).toHaveBeenCalledTimes(1);
    expect(clientEnd).toHaveBeenCalledTimes(1);
    expect(pool.end).toHaveBeenCalledTimes(1);
    expect(logger.error).toHaveBeenCalledWith('Failed to initialize DB:', runnerError);
    expect(process.exitCode).toBe(1);
  });
});
