jest.mock('dotenv', () => ({ config: jest.fn() }));

const mockFsModule = {
  existsSync: jest.fn(),
  mkdirSync: jest.fn()
};
jest.mock('fs', () => mockFsModule);

const mockPgClientFactory = jest.fn();
jest.mock('pg', () => ({ Client: mockPgClientFactory }));

const mockRedisFactory = jest.fn();
jest.mock('ioredis', () => mockRedisFactory);
jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('checkEnv', () => {
  const originalEnv = process.env;
  const originalNodeEnv = process.env.NODE_ENV;
  let mockClient;
  let mockRedisInstance;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    process.env.NODE_ENV = 'development';
    process.env.PGHOST = 'localhost';
    process.env.PGUSER = 'user';
    process.env.PGDATABASE = 'db';
    process.env.PGPASSWORD = 'pass';
    process.env.PGPORT = '5432';
    process.env.REDIS_URL = 'redis://redis:6379';
    process.env.OPENAI_API_KEY = 'test-api-key';

    mockFsModule.existsSync.mockReset();
    mockFsModule.mkdirSync.mockReset();

    mockClient = {
      connect: jest.fn().mockResolvedValue(),
      query: jest.fn(),
      end: jest.fn().mockResolvedValue()
    };
    mockPgClientFactory.mockReset();
    mockPgClientFactory.mockImplementation(() => mockClient);

    mockRedisInstance = {
      connect: jest.fn().mockResolvedValue(),
      ping: jest.fn().mockResolvedValue('PONG'),
      disconnect: jest.fn()
    };
    mockRedisFactory.mockReset();
    mockRedisFactory.mockImplementation(() => mockRedisInstance);

    mockClient.query.mockImplementation(async sql => {
      if (sql === 'SELECT 1') {
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    process.env.NODE_ENV = originalNodeEnv;
  });

  test('resolves when all services and auth folders are available', async () => {
    mockFsModule.existsSync.mockReturnValue(true);

    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).resolves.toBeUndefined();
    await expect(checkEnv()).resolves.toBeUndefined();

    expect(mockClient.connect).toHaveBeenCalledTimes(1);
    expect(mockClient.end).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('throws when PostgreSQL environment variables are missing', async () => {
    delete process.env.PGUSER;

    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).rejects.toThrow('Missing PostgreSQL environment variables');
    expect(mockPgClientFactory).not.toHaveBeenCalled();
  });

  test('throws when PostgreSQL connection fails', async () => {
    mockFsModule.existsSync.mockReturnValue(true);
    mockClient.connect.mockRejectedValue(new Error('connection refused'));

    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).rejects.toThrow('Unable to connect to PostgreSQL');
  });

  test('throws when OpenAI API key is missing', async () => {
    delete process.env.OPENAI_API_KEY;
    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).rejects.toThrow('OPENAI_API_KEY is not set');
  });

  test('throws when Redis is unavailable', async () => {
    mockFsModule.existsSync.mockReturnValue(true);
    mockRedisInstance.connect.mockRejectedValue(new Error('redis down'));

    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).rejects.toThrow('Unable to connect to Redis');
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('warns when WhatsApp auth folders are missing', async () => {
    const logger = require('../src/logger');
    mockClient.query.mockImplementation(async sql => {
      if (sql === 'SELECT 1') {
        return { rows: [] };
      }
      if (sql.startsWith('SELECT id')) {
        return { rows: [{ id: 7, name: 'Support', phone: '+20123' }] };
      }
      return { rows: [] };
    });
    mockFsModule.existsSync.mockReturnValue(false);

    const { checkEnv } = require('../src/checkEnv');
    await expect(checkEnv()).resolves.toBeUndefined();
    expect(logger.warn).toHaveBeenCalled();
  });
});
