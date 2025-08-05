const EventEmitter = require('events');

const mockSock = {
  ev: new EventEmitter(),
  end: jest.fn(),
  logout: jest.fn(),
  sendMessage: jest.fn(),
  updateMediaMessage: jest.fn()
};

jest.mock('@whiskeysockets/baileys', () => ({
  __mockSock: mockSock,
  default: jest.fn(() => mockSock),
  useMultiFileAuthState: jest.fn(async () => ({ state: {}, saveCreds: jest.fn() })),
  DisconnectReason: { loggedOut: 0 },
  downloadMediaMessage: jest.fn(),
  getContentType: jest.fn()
}));

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

jest.mock('../src/metrics', () => ({
  connectionGauge: { labels: () => ({ set: jest.fn() }) },
  messageCounter: { labels: () => ({ inc: jest.fn() }) }
}));

jest.mock('../src/queue', () => ({ messageQueue: { add: jest.fn() } }));

jest.mock('qrcode-terminal', () => ({ generate: jest.fn() }));

describe('botManager', () => {
  let botManager;

  beforeEach(() => {
    jest.resetModules();
    mockSock.ev = new EventEmitter();
    botManager = require('../src/botManager');
  });

  afterEach(() => {
    try { botManager.stopBot(1); } catch (e) {}
    try { botManager.stopBot(2); } catch (e) {}
    try { botManager.stopBot(3); } catch (e) {}
  });

  test('start and stop bot', async () => {
    await botManager.startBot({ id: 1, organization_id: 1, assistant_id: 'a1' });
    mockSock.ev.emit('connection.update', { connection: 'open' });
    expect(botManager.getBotStatus(1)).toBe('connected');
    botManager.stopBot(1);
    expect(botManager.getBotStatus(1)).toBe('stopped');
  });

  test('emits qr event on start', async () => {
    const events = [];
    botManager.events.on('update', e => events.push(e));
    await botManager.startBot({ id: 2, organization_id: 1, assistant_id: 'a1' });
    mockSock.ev.emit('connection.update', { qr: '123' });
    expect(events.find(e => e.status === 'qr' && e.qr === '123' && e.botId === 2)).toBeTruthy();
  });

  test('updates status on disconnect', async () => {
    const events = [];
    botManager.events.on('update', e => events.push(e));
    await botManager.startBot({ id: 3, organization_id: 1, assistant_id: 'a1' });
    mockSock.ev.emit('connection.update', { connection: 'close', lastDisconnect: { error: new Error('x') } });
    expect(botManager.getBotStatus(3)).toBe('disconnected');
    expect(events.find(e => e.status === 'disconnected' && e.botId === 3)).toBeTruthy();
  });
});
