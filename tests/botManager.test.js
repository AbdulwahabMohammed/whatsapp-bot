const EventEmitter = require('events');
const { Boom } = require('@hapi/boom');
const fs = require('fs');
const path = require('path');

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
  DisconnectReason: { loggedOut: 0, connectionReplaced: 428 },
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
    try { botManager.stopBot(4); } catch (e) {}
    try { botManager.stopBot(5); } catch (e) {}
    fs.rmSync(path.join(__dirname, '../auth-5'), { recursive: true, force: true });
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

  test('sets conflict status and avoids reconnect on connection replace', async () => {
    jest.useFakeTimers();
    const events = [];
    botManager.events.on('update', e => events.push(e));
    const startSpy = jest.spyOn(botManager, 'startBot');
    await botManager.startBot({ id: 4, organization_id: 1, assistant_id: 'a1' });
    startSpy.mockClear();
    mockSock.ev.emit('connection.update', {
      connection: 'close',
      lastDisconnect: { error: new Boom('conflict', { statusCode: 428 }) }
    });
    jest.runAllTimers();
    expect(startSpy).not.toHaveBeenCalled();
    expect(botManager.getBotStatus(4)).toBe('conflict');
    expect(events.find(e => e.status === 'conflict' && e.botId === 4)).toBeTruthy();
    jest.useRealTimers();
  });

  test('cleans auth folder and notifies on session error', async () => {
    const events = [];
    botManager.events.on('update', e => events.push(e));
    await botManager.startBot({ id: 5, organization_id: 1, assistant_id: 'a1' });

    const authPath = path.join(__dirname, '../auth-5');
    fs.mkdirSync(authPath, { recursive: true });

    const { getContentType } = require('@whiskeysockets/baileys');
    getContentType.mockImplementation(() => {
      throw new Error('Bad MAC');
    });

    mockSock.ev.emit('messages.upsert', {
      type: 'notify',
      messages: [
        {
          key: { fromMe: false, remoteJid: '1', id: 'msg1' },
          message: { conversation: 'hi' }
        }
      ]
    });

    await new Promise(resolve => setImmediate(resolve));

    expect(fs.existsSync(authPath)).toBe(false);
    expect(botManager.getBotStatus(5)).toBe('stopped');
    expect(events.find(e => e.botId === 5 && e.status === 'stopped' && e.message)).toBeTruthy();
  });
});
