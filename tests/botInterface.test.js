/** @jest-environment jsdom */
const { TextEncoder, TextDecoder } = require('util');
global.TextEncoder = TextEncoder;
global.TextDecoder = TextDecoder;
const request = require('supertest');
const EventEmitter = require('events');
const bcrypt = require('bcrypt');
const { initBotsPage } = require('../public/bots');
const { postExpectStatus } = require('./utils/csrf');

process.env.SESSION_SECRET = 'test-secret';
process.env.ADMIN_PORT = 0;

jest.mock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));

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

async function login (agent) {
  await postExpectStatus(
    agent,
    '/login',
    302,
    { username: 'ed', password: 'secret', token: '123456' },
    { tokenPath: '/login' }
  );
}

describe('bot interface permissions', () => {
  test('cannot view bots of another organization', async () => {
    const agent = request.agent(app);
    await login(agent);
    const res = await agent.get('/org/2/bots');
    expect(res.status).toBe(403);
    const page = await agent.get('/org/2/bots/manage');
    expect(page.status).toBe(403);
  });
});

describe('bots frontend script', () => {
  test('shows QR and toggles button based on ws events', async () => {
    document.body.innerHTML = `
      <table><tbody><tr data-bot-id="1"><td></td><td></td><td class="status">stopped</td><td><button class="start-stop">Start</button></td></tr></tbody></table>
      <div id="qrModal" style="display:none"><img id="qrImage" /></div>
    `;
    window.getCsrfToken = jest.fn(() => 'csrf-token');
    window.updateCsrfToken = jest.fn();
    global.fetch = jest.fn(() =>
      Promise.resolve({
        json: () => Promise.resolve({ status: 'connected' }),
        headers: { get: jest.fn(() => 'next-token') }
      })
    );
    let ws;
    function factory () {
      ws = { onmessage: null };
      return ws;
    }
    initBotsPage(factory);
    const btn = document.querySelector('button.start-stop');
    btn.click();
    await Promise.resolve();
    ws.onmessage({ data: JSON.stringify({ botId: 1, status: 'qr', qr: 'data:image/png;base64,abc' }) });
    const img = document.getElementById('qrImage');
    expect(img.src).toBe('data:image/png;base64,abc');
    expect(document.getElementById('qrModal').style.display).toBe('block');
    ws.onmessage({ data: JSON.stringify({ botId: 1, status: 'connected' }) });
    expect(btn.textContent).toBe('Stop');
    ws.onmessage({ data: JSON.stringify({ botId: 1, status: 'stopped' }) });
    expect(btn.textContent).toBe('Start');
    expect(global.fetch).toHaveBeenCalledWith('/bot/1/start', {
      headers: { 'CSRF-Token': 'csrf-token' },
      method: 'POST'
    });
    await Promise.resolve();
    expect(window.updateCsrfToken).toHaveBeenCalledWith('next-token');
  });
});
