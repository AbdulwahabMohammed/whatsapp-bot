const request = require('supertest');
const bcrypt = require('bcrypt');

jest.mock('../src/index', () => ({
  createOrganization: jest.fn(async (n, p, i, l) => ({ id: 1, name: n, phone: p, instructions: i, language: l })),
  listOrganizations: jest.fn(async () => ([]))
}));

jest.mock('../src/assistant', () => ({
  createAssistant: jest.fn()
}));

jest.mock('../src/scripts/uploadFile', () => ({
  upload: jest.fn()
}));

jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

jest.mock('../src/queue', () => ({
  messageQueue: { close: jest.fn(async () => {}) },
  bulkQueue: { add: jest.fn() },
  getQueueLength: jest.fn(async () => 0)
}));

jest.mock('speakeasy', () => ({
  totp: { verify: jest.fn(() => true) },
  generateSecret: jest.fn(() => ({ base32: 'AAAA', otpauth_url: 'otpauth://' }))
}));

jest.mock('qrcode', () => ({
  toDataURL: jest.fn(async () => 'data:image/png;base64,AAA')
}));

jest.mock('../src/db', () => ({
  query: jest.fn()
}));

const pool = require('../src/db');

const { app, startAdminServer, stopAdminServer } = require('../src/admin');
const { createOrganization } = require('../src/index');

describe('admin routes', () => {
  let serverInfo;

  beforeAll(() => {
    serverInfo = startAdminServer();
  });

  afterAll(async () => {
    await stopAdminServer(serverInfo.server, serverInfo.intervalId);
  });

  beforeEach(() => {
    const hash = bcrypt.hashSync('secret', 10);
    pool.query.mockImplementation(async text => {
      if (text.includes('SELECT password_hash')) {
        return { rows: [{ password_hash: hash, role: 'admin', totp_secret: 'AAAA' }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    pool.query.mockReset();
  });

  it('creates organization', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.post('/org/new').send('name=Test&phone=123');
    expect(createOrganization).toHaveBeenCalledWith(
      'Test',
      '123',
      undefined,
      undefined,
      null,
      null
    );
  });

  it('lists organizations', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/').expect(200);
  });

  it('serves metrics', async () => {
    await request(app).get('/metrics').expect(200);
  });

  it('serves stats page', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/stats').expect(200);
  });

  it('serves analytics page', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/analytics').expect(200);
  });

  it('serves broadcast form', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/broadcast').expect(200);
  });

  it('queues broadcast message', async () => {
    const { bulkQueue } = require('../src/queue');
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent
      .post('/broadcast')
      .send('organization_id=1&phones=1,2&text=hi')
      .expect(302);
    expect(bulkQueue.add).toHaveBeenCalledWith('broadcast', {
      orgId: 1,
      text: 'hi',
      phones: ['1', '2'],
    });
  });

  it('serves unanswered questions page', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/unanswered').expect(200);
  });

  it('serves faq suggestions page', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.get('/faq').expect(200);
  });

  it('deletes faq suggestion', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.post('/faq/1/delete').expect(302);
    expect(pool.query).toHaveBeenCalledWith('DELETE FROM faq_suggestions WHERE id=$1', ['1']);
  });

  it('disables 2FA for user', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret&token=123456');
    await agent.post('/users/1/disable-2fa').expect(302);
    expect(pool.query).toHaveBeenCalledWith('UPDATE users SET totp_secret=NULL WHERE id=$1', ['1']);
  });
});
