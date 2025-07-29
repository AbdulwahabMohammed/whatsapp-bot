let handler;
const mockSock = { ev: { on: jest.fn() }, sendMessage: jest.fn() };

jest.mock('bullmq', () => ({
  Worker: jest.fn((name, fn) => { handler = fn; })
}));

jest.mock('@whiskeysockets/baileys', () => ({
  default: jest.fn(() => mockSock),
  useMultiFileAuthState: jest.fn(async () => ({ state: {}, saveCreds: jest.fn() })),
  DisconnectReason: { loggedOut: 0 }
}));

jest.mock('../src/db', () => ({ query: jest.fn().mockResolvedValue({ rows: [] }) }));

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/metrics', () => ({
  connectionGauge: { labels: () => ({ set: jest.fn() }) },
  messageCounter: { labels: () => ({ inc: jest.fn() }) },
  queueLengthGauge: { set: jest.fn() }
}));

jest.mock('../src/chat', () => ({ sendMessage: jest.fn() }));

// openai is unused but mocked to avoid loading real module
jest.mock('../src/openai', () => ({}));

describe('worker message flow', () => {
  beforeEach(() => {
    jest.resetModules();
    handler = undefined;
    require('../src/db').query.mockReset();
    require('../src/db').query.mockResolvedValue({ rows: [{ id: 1, assistant_id: 'a1' }] });
    mockSock.ev.on.mockReset();
    mockSock.sendMessage.mockReset();
    require('../src/chat').sendMessage.mockReset();
  });

  test('sends reply via WhatsApp', async () => {
    require('../src/chat').sendMessage.mockResolvedValue('reply');
    require('../src/worker');
    await new Promise(r => setImmediate(r));
    await handler({ data: { orgId: 1, assistantId: 'a1', sender: '123', text: 'hi' } });
    expect(require('../src/chat').sendMessage).toHaveBeenCalledWith(1, 'a1', '123', 'hi');
    expect(mockSock.sendMessage).toHaveBeenCalledWith('123', { text: 'reply' });
  });

  test('sends attachment if provided', async () => {
    require('../src/chat').sendMessage.mockResolvedValue('file');
    require('../src/worker');
    await new Promise(r => setImmediate(r));
    await handler({
      data: {
        orgId: 1,
        assistantId: 'a1',
        sender: '123',
        text: 'hi',
        replyAttachmentType: 'image',
        replyAttachmentPath: 'uploads/pic.jpg',
      },
    });
    expect(mockSock.sendMessage).toHaveBeenCalledWith('123', {
      image: { url: expect.stringContaining('uploads/pic.jpg') },
      caption: 'file',
    });
  });

  test('logs error on OpenAI failure', async () => {
    const logger = require('../src/logger');
    require('../src/chat').sendMessage.mockRejectedValue(new Error('fail'));
    require('../src/worker');
    await new Promise(r => setImmediate(r));
    await handler({ data: { orgId: 1, assistantId: 'a1', sender: '123', text: 'hi' } });
    expect(mockSock.sendMessage).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});
