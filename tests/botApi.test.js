const request = require('supertest');
const WebSocket = require('ws');
const EventEmitter = require('events');
const bcrypt = require('bcrypt');

process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_PORT = 0;

jest.mock('../src/logger', () => ({ info: jest.fn(), error: jest.fn() }));

jest.mock('../src/metrics', () => ({
  client: { register: { contentType: 'text/plain', metrics: jest.fn(async () => '') } },
  requestCounter: { inc: jest.fn() },
  connectionGauge: { get: jest.fn(() => ({ values: [] })), labels: () => ({ set: jest.fn() }) },
  queueLengthGauge: { set: jest.fn() }
}));

jest.mock('../src/queue', () => ({
  messageQueue: { close: jest.fn(async () => {}) },
  bulkQueue: { add: jest.fn() },
  getQueueLength: jest.fn(async () => 0)
}));

jest.mock('speakeasy', () => ({
  totp: { verify: jest.fn(() => true) },
  generateSecret: jest.fn()
}));

jest.mock('qrcode', () => ({ toDataURL: jest.fn() }));
jest.mock('../src/assistant', () => ({ createAssistant: jest.fn() }));
jest.mock('../src/scripts/uploadFile', () => ({ upload: jest.fn() }));

const mockEvents = new EventEmitter();
let mockStatus = 'stopped';
jest.mock('../src/botManager', () => ({
  startBot: jest.fn(async () => { mockStatus = 'started'; }),
  stopBot: jest.fn(() => { mockStatus = 'stopped'; }),
  getBotStatus: jest.fn(() => mockStatus),
  events: mockEvents
}));

const mockHash = bcrypt.hashSync('secret', 10);
const bots = [];
jest.mock('../src/db', () => ({
  query: jest.fn(async (text, params) => {
    if (text.includes('SELECT password_hash')) {
      return {
        rows: [
          {
            password_hash: mockHash,
            role: 'editor',
            totp_secret: 'AAAA',
            organization_id: 1
          }
        ]
      };
    }
    if (text.startsWith('INSERT INTO bots')) {
      const bot = {
        id: bots.length + 1,
        organization_id: Number(params[0]),
        assistant_id: params[1],
        name: params[2],
        phone: params[3],
        status: params[4]
      };
      bots.push(bot);
      return { rows: [bot] };
    }
    if (text.startsWith('SELECT id, name, assistant_id, status FROM bots WHERE organization_id=$1')) {
      return { rows: bots.filter(b => b.organization_id === Number(params[0])) };
    }
    if (text.startsWith('SELECT organization_id FROM bots WHERE id=$1')) {
      const bot = bots.find(b => b.id === Number(params[0]));
      return { rows: bot ? [{ organization_id: bot.organization_id }] : [] };
    }
    if (text.startsWith('SELECT * FROM bots WHERE id=$1')) {
      const bot = bots.find(b => b.id === Number(params[0]));
      return { rows: bot ? [bot] : [] };
    }
    if (text.startsWith('SELECT id FROM bots')) {
      return { rows: bots.map(b => ({ id: b.id })) };
    }
    return { rows: [] };
  })
}));

const { app, startAdminServer, stopAdminServer } = require('../src/admin');

let serverInfo;
beforeAll(() => {
  serverInfo = startAdminServer();
});

afterAll(async () => {
  await stopAdminServer(serverInfo.server, serverInfo.intervalId);
});

beforeEach(() => {
  mockStatus = 'stopped';
});

async function login(agent) {
  await agent.post('/login').send('username=ed&password=secret&token=123456');
}

describe('bot API', () => {
  test('creates bot linked to organization', async () => {
    const agent = request.agent(app);
    await login(agent);
    const res = await agent
      .post('/org/1/bots')
      .send('assistant_id=a1&name=Bot1');
    expect(res.status).toBe(200);
    expect(res.body.assistant_id).toBe('a1');
    const list = await agent.get('/org/1/bots');
    expect(list.body.length).toBe(1);
    expect(list.body[0].assistant_id).toBe('a1');
  });

  test('start and stop bot via API', async () => {
    const agent = request.agent(app);
    await login(agent);
    await agent.post('/org/1/bots').send('assistant_id=a1');
    let res = await agent.post('/bot/1/start');
    expect(res.body.status).toBe('started');
    res = await agent.get('/bot/1/status');
    expect(res.body.status).toBe('started');
    res = await agent.post('/bot/1/stop');
    expect(res.body.status).toBe('stopped');
  });

  test('broadcasts qr over websocket', async () => {
    const agent = request.agent(app);
    await login(agent);
    await agent.post('/org/1/bots').send('assistant_id=a1');
    const port = serverInfo.server.address().port;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    await new Promise(resolve => ws.on('open', resolve));
    const msgPromise = new Promise(resolve => {
      ws.on('message', data => {
        const obj = JSON.parse(data.toString());
        if (obj.qr) resolve(obj);
      });
    });
    await agent.post('/bot/1/start');
    mockEvents.emit('update', { botId: 1, status: 'qr', qr: '123' });
    const msg = await msgPromise;
    expect(msg).toEqual({ botId: 1, status: 'qr', qr: '123' });
    ws.close();
  });
});

