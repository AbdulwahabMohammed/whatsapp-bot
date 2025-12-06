let handlers;
const path = require('path');
const mockSock = { sendMessage: jest.fn(), ws: { readyState: 'open' } };

const mockRedisInstance = {
  connect: jest.fn(async () => {}),
  info: jest.fn(async () => 'redis_version:7.2.0\r\n'),
  disconnect: jest.fn(() => {})
};

jest.mock('ioredis', () => jest.fn(() => mockRedisInstance));

jest.mock('bullmq', () => {
  const __handlers = {};
  return {
    Worker: jest.fn((name, fn) => { __handlers[name] = fn; }),
    Queue: jest.fn(() => ({ add: jest.fn(), getWaitingCount: jest.fn() })),
    __handlers
  };
});

jest.mock('../src/botManager', () => ({
  getSocket: jest.fn(() => mockSock),
  startBot: jest.fn()
}));

jest.mock('../src/queue', () => ({
  messageQueue: { add: jest.fn(), getWaitingCount: jest.fn() },
  bulkQueue: { add: jest.fn() },
  getQueueLength: jest.fn()
}));

jest.mock('../src/checkEnv', () => ({
  checkEnv: jest.fn(() => Promise.resolve())
}));

jest.mock('../src/db', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/metrics', () => ({
  connectionGauge: { labels: () => ({ set: jest.fn() }) },
  messageCounter: { labels: () => ({ inc: jest.fn() }) },
  queueLengthGauge: { set: jest.fn() }
}));

jest.mock('../src/chat', () => ({ sendMessage: jest.fn() }));

jest.mock('../src/openai', () => ({
  beta: { threads: { create: jest.fn(async () => ({ id: 't1' })) } }
}));

describe('worker message flow', () => {
  beforeEach(() => {
    jest.resetModules();
    const env = require('../src/checkEnv');
    env.checkEnv.mockClear();
    env.checkEnv.mockResolvedValue();
    const Redis = require('ioredis');
    Redis.mockClear();
    mockRedisInstance.connect.mockReset();
    mockRedisInstance.connect.mockImplementation(async () => {});
    mockRedisInstance.info.mockReset();
    mockRedisInstance.info.mockImplementation(async () => 'redis_version:7.2.0\r\n');
    mockRedisInstance.disconnect.mockReset();
    const bull = require('bullmq');
    Object.keys(bull.__handlers).forEach(k => delete bull.__handlers[k]);
    handlers = bull.__handlers;
    const db = require('../src/db');
    db.query.mockReset();
    db.query.mockImplementation(async text => {
      if (text.startsWith('SELECT * FROM whatsapp_bots WHERE id=$1')) {
        return { rows: [{ id: 1, organization_id: 1, assistant_id: 'a1' }] };
      }
      if (text.startsWith('SELECT working_hours_start')) {
        return { rows: [{ working_hours_start: null, working_hours_end: null, instructions: null }] };
      }
      if (text.startsWith('SELECT id, thread_id, escalated FROM conversations')) {
        return { rows: [] };
      }
      if (text.startsWith('INSERT INTO conversations')) {
        return { rows: [{ id: 1, thread_id: 't1', escalated: false }] };
      }
      if (text.startsWith('SELECT COUNT(*) FROM messages WHERE conversation_id=$1')) {
        return { rows: [{ count: '0' }] };
      }
      if (text.startsWith('SELECT summary FROM conversations WHERE id=$1')) {
        return { rows: [{ summary: null }] };
      }
      if (text.startsWith('SELECT sender, text FROM messages WHERE conversation_id=$1 ORDER BY id')) {
        return { rows: [] };
      }
      return { rows: [] };
    });
    mockSock.sendMessage.mockReset();
    mockSock.ws.readyState = 'open';
    require('../src/chat').sendMessage.mockReset();
    global.fetch = jest.fn(() => Promise.resolve({}));
    process.env.WEBHOOK_URL = '';
    const queue = require('../src/queue');
    queue.messageQueue.add.mockReset();
    queue.messageQueue.add.mockResolvedValue({});
    queue.bulkQueue.add.mockReset();
    queue.bulkQueue.add.mockResolvedValue({});
  });

  afterEach(() => {
    delete global.fetch;
    require('../src/scheduler').stopScheduler();
  });

  test('sends reply via WhatsApp', async () => {
    require('../src/chat').sendMessage.mockResolvedValue('reply');
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    await handlers.messages({ data: { botId: 1, orgId: 1, assistantId: 'a1', sender: '123', text: 'hi' } });
    expect(require('../src/chat').sendMessage).toHaveBeenCalledWith(1, 'a1', '123', 'hi');
    expect(mockSock.sendMessage).toHaveBeenCalledWith('123', { text: 'reply' });
  });

  test('requeues job when socket is disconnected', async () => {
    const chat = require('../src/chat');
    const queue = require('../src/queue');
    const botManager = require('../src/botManager');
    chat.sendMessage.mockResolvedValue('reply');
    mockSock.ws.readyState = 'closed';
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    const job = {
      id: '1',
      name: 'message',
      data: { botId: 1, orgId: 1, assistantId: 'a1', sender: '123', text: 'hi' }
    };
    await handlers.messages(job);
    expect(botManager.startBot).toHaveBeenCalledWith(
      expect.objectContaining({ id: 1, organization_id: 1, assistant_id: 'a1' })
    );
    expect(queue.messageQueue.add).toHaveBeenCalledWith(
      'message',
      job.data,
      expect.objectContaining({ delay: expect.any(Number) })
    );
    expect(mockSock.sendMessage).not.toHaveBeenCalled();
  });

  test('saves image message without caption', async () => {
    const chat = require('../src/chat');
    const db = require('../src/db');
    chat.sendMessage.mockResolvedValue(null);
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    await expect(
      handlers.messages({
        data: {
          botId: 1,
          orgId: 1,
          assistantId: 'a1',
          sender: '123',
          text: null,
          attachmentType: 'image',
          attachmentPath: 'uploads/pic.jpg'
        }
      })
    ).resolves.toBeUndefined();

    expect(chat.sendMessage).toHaveBeenCalledWith(1, 'a1', '123', '');
    const insertCalls = db.query.mock.calls.filter(call => call[0].startsWith('INSERT INTO messages'));
    const userInsert = insertCalls.find(call => call[1]?.[1] === 'user');
    expect(userInsert).toBeDefined();
    expect(userInsert[1][2]).toBe('');
  });

  test('sends attachment if provided', async () => {
    require('../src/chat').sendMessage.mockResolvedValue('file');
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    await handlers.messages({
      data: {
        botId: 1,
        orgId: 1,
        assistantId: 'a1',
        sender: '123',
        text: 'hi',
        replyAttachmentType: 'image',
        replyAttachmentPath: 'uploads/pic.jpg'
      }
    });
    const attachmentPath = path.join('uploads', 'pic.jpg');
    expect(mockSock.sendMessage).toHaveBeenCalledWith('123', {
      image: { url: expect.stringContaining(attachmentPath) },
      caption: 'file'
    });
  });

  test('logs error on OpenAI failure', async () => {
    const logger = require('../src/logger');
    require('../src/chat').sendMessage.mockRejectedValue(new Error('fail'));
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    await handlers.messages({ data: { botId: 1, orgId: 1, assistantId: 'a1', sender: '123', text: 'hi' } });
    expect(mockSock.sendMessage).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  test('posts webhook with message data', async () => {
    require('../src/chat').sendMessage.mockResolvedValue('reply');
    process.env.WEBHOOK_URL = 'http://hook';
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    const ts = 111;
    await handlers.messages({ data: { botId: 1, orgId: 1, assistantId: 'a1', sender: '123', text: 'hi', receivedAt: ts } });
    expect(global.fetch).toHaveBeenCalledTimes(2);
    const body = JSON.parse(global.fetch.mock.calls[0][1].body);
    expect(body).toEqual({ sender: '123', text: 'hi', timestamp: ts });
  });

  test('bulk worker sends to each phone', async () => {
    const db = require('../src/db');
    const workerModule = require('../src/worker');
    await workerModule.bootstrapPromise;
    await new Promise(resolve => setImmediate(resolve));
    db.query.mockImplementation(async text => {
      if (text.startsWith('SELECT id FROM conversations')) {
        return { rows: [] };
      }
      if (text.startsWith('INSERT INTO conversations')) {
        return { rows: [{ id: 1 }] };
      }
      return { rows: [] };
    });
    await handlers.bulkMessages({ data: { botId: 1, orgId: 1, phones: ['1', '2'], text: 'hi' } });
    expect(mockSock.sendMessage).toHaveBeenCalledTimes(2);
  });
});
