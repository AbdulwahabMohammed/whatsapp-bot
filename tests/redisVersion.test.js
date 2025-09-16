const mockRedisInstance = {
  connect: jest.fn(),
  info: jest.fn(),
  disconnect: jest.fn()
};

jest.mock('ioredis', () => jest.fn(() => mockRedisInstance));

describe('ensureRedisVersion', () => {
  let ensureRedisVersion;
  let MIN_REDIS_VERSION;

  beforeEach(() => {
    jest.resetModules();
    mockRedisInstance.connect.mockReset();
    mockRedisInstance.connect.mockImplementation(async () => {});
    mockRedisInstance.info.mockReset();
    mockRedisInstance.info.mockImplementation(async () => 'redis_version:7.2.0\r\n');
    mockRedisInstance.disconnect.mockReset();
    ({ ensureRedisVersion, MIN_REDIS_VERSION } = require('../src/redisVersion'));
  });

  test('resolves when Redis version meets the minimum requirement', async () => {
    await expect(
      ensureRedisVersion({ url: 'redis://localhost:6379', minVersion: MIN_REDIS_VERSION })
    ).resolves.toBe('7.2.0');
    expect(mockRedisInstance.connect).toHaveBeenCalledTimes(1);
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('throws an explicit error when Redis version is too old', async () => {
    mockRedisInstance.info.mockImplementation(async () => 'redis_version:6.0.9\r\n');

    await expect(
      ensureRedisVersion({ url: 'redis://localhost:6379', minVersion: '6.2.0' })
    ).rejects.toMatchObject({
      code: 'REDIS_VERSION_UNSUPPORTED',
      currentVersion: '6.0.9',
      requiredVersion: '6.2.0'
    });
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('throws when Redis does not expose version info', async () => {
    mockRedisInstance.info.mockImplementation(async () => '# Server\nrole:master\n');

    await expect(ensureRedisVersion()).rejects.toMatchObject({ code: 'REDIS_VERSION_UNKNOWN' });
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });

  test('wraps unexpected errors with a generic code', async () => {
    const failure = new Error('boom');
    mockRedisInstance.connect.mockImplementation(async () => {
      throw failure;
    });

    await expect(ensureRedisVersion()).rejects.toMatchObject({ code: 'REDIS_VERSION_CHECK_FAILED' });
    expect(mockRedisInstance.disconnect).toHaveBeenCalledTimes(1);
  });
});
