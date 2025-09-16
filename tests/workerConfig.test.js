jest.mock('bullmq', () => ({
  Worker: jest.fn(() => ({ on: jest.fn() })),
  Queue: jest.fn(() => ({ add: jest.fn(), getWaitingCount: jest.fn() }))
}));

jest.mock('../src/botManager', () => ({
  getSocket: jest.fn(() => ({ ws: { readyState: 'open' } })),
  startBot: jest.fn()
}));

jest.mock('../src/queue', () => ({
  messageQueue: { add: jest.fn(), getWaitingCount: jest.fn() },
  bulkQueue: { add: jest.fn() },
  getQueueLength: jest.fn()
}));

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/metrics', () => ({
  connectionGauge: { labels: () => ({ set: jest.fn() }) },
  messageCounter: { labels: () => ({ inc: jest.fn() }) },
  queueLengthGauge: { set: jest.fn() }
}));

jest.mock('../src/chat', () => ({ sendMessage: jest.fn() }));

jest.mock('../src/openai', () => ({
  beta: {
    threads: { create: jest.fn(async () => ({ id: 'thread-1' })) }
  }
}));

jest.mock('../src/db', () => ({ query: jest.fn(async () => ({ rows: [] })) }));

jest.mock('../src/scheduler', () => ({
  startScheduler: jest.fn(),
  stopScheduler: jest.fn()
}));

jest.mock('../src/redisVersion', () => ({
  MIN_REDIS_VERSION: '6.2.0',
  ensureRedisVersion: jest.fn().mockResolvedValue('7.2.0')
}));

describe('worker configuration', () => {
  const loadWorker = () => {
    let workerModule;
    jest.isolateModules(() => {
      workerModule = require('../src/worker');
    });
    return workerModule;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.clearAllMocks();
    delete process.env.FAST_DEV;
    delete process.env.CONNECTION_RETRY_DELAY;
    delete process.env.BULK_MESSAGE_DELAY;
  });

  it('uses production defaults when FAST_DEV is disabled', async () => {
    const workerModule = loadWorker();
    await workerModule.bootstrapPromise;
    expect(workerModule.__internals.CONNECTION_RETRY_DELAY_MS).toBe(5000);
    expect(workerModule.__internals.BULK_MESSAGE_DELAY).toBe(500);
  });

  it('applies FAST_DEV defaults when overrides are unset', async () => {
    process.env.FAST_DEV = 'true';
    const workerModule = loadWorker();
    await workerModule.bootstrapPromise;
    expect(workerModule.__internals.CONNECTION_RETRY_DELAY_MS).toBe(1000);
    expect(workerModule.__internals.BULK_MESSAGE_DELAY).toBe(0);
  });
});
