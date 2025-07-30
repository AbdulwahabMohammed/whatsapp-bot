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

process.env.SESSION_SECRET = 'test-secret';

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
    const qrcode = require('qrcode');
    qrcode.toDataURL.mockReset();
  });

  it('redirects profile routes when not logged in', async () => {
    const agent = request.agent(app);
    await agent.get('/profile').expect(302);
    await agent.get('/profile/setup-2fa').expect(302);
    await agent.post('/profile/enable-2fa').expect(302);
    await agent.post('/profile/disable-2fa').expect(302);
  });

  it('logs in without 2FA when totp_secret is null', async () => {
    const hash = bcrypt.hashSync('secret', 10);
    pool.query.mockImplementation(async text => {
      if (text.includes('SELECT password_hash')) {
        return { rows: [{ password_hash: hash, role: 'admin', totp_secret: null }] };
      }
      return { rows: [] };
    });
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret').expect(302);
    const qrcode = require('qrcode');
    expect(qrcode.toDataURL).not.toHaveBeenCalled();
  });

  it('returns 500 if setup query fails', async () => {
    const hash = bcrypt.hashSync('secret', 10);
    pool.query.mockImplementation(async text => {
      if (text.includes('SELECT password_hash')) {
        return { rows: [{ password_hash: hash, role: 'admin', totp_secret: null }] };
      }
      if (text.startsWith('SELECT totp_secret FROM users')) {
        throw new Error('fail');
      }
      return { rows: [] };
    });
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret').expect(302);
    const logger = require('../src/logger');
    logger.error.mockClear();
    await agent.get('/profile/setup-2fa').expect(500);
    expect(logger.error).toHaveBeenCalled();
  });

  it('enables and disables 2FA from profile', async () => {
    const hash = bcrypt.hashSync('secret', 10);
    let secret = null;
    pool.query.mockImplementation(async (text, params) => {
      if (text.includes('SELECT password_hash')) {
        return { rows: [{ password_hash: hash, role: 'admin', totp_secret: secret }] };
      }
      if (text.startsWith('SELECT role, totp_secret')) {
        return { rows: [{ role: 'admin', totp_secret: secret }] };
      }
      if (text.startsWith('SELECT totp_secret FROM users')) {
        return { rows: [{ totp_secret: secret }] };
      }
      if (text.startsWith('UPDATE users SET totp_secret=$1')) {
        secret = params[0];
        return { rows: [] };
      }
      if (text.startsWith('UPDATE users SET totp_secret=NULL')) {
        secret = null;
        return { rows: [] };
      }
      return { rows: [] };
    });

    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret');
    await agent.get('/profile/setup-2fa').expect(200);
    await agent.post('/profile/enable-2fa').send('token=123456').expect(302);
    expect(secret).toBe('AAAA');
    await agent.get('/profile/setup-2fa').expect(302);
    await agent.post('/profile/enable-2fa').send('token=111111').expect(302);
    expect(secret).toBe('AAAA');
    const updates = pool.query.mock.calls.filter(c =>
      c[0].startsWith('UPDATE users SET totp_secret=$1')
    );
    expect(updates.length).toBe(1);

    const agent2 = request.agent(app);
    await agent2.post('/login').send('username=admin&password=secret').expect(401);

    await agent.post('/profile/disable-2fa').expect(302);
    expect(secret).toBe(null);

    const agent3 = request.agent(app);
    await agent3.post('/login').send('username=admin&password=secret').expect(302);
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

  it('exits if SESSION_SECRET is missing', () => {
    const logger = require('../src/logger');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    delete process.env.SESSION_SECRET;
    logger.error.mockClear();
    expect(() => startAdminServer()).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
    exitSpy.mockRestore();
    process.env.SESSION_SECRET = 'test-secret';
  });

  it('exits if OPENAI_API_KEY is missing', () => {
    jest.resetModules();
    const logger = require('../src/logger');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    delete process.env.OPENAI_API_KEY;
    logger.error.mockClear();
    expect(() => require('../src/openai')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
    exitSpy.mockRestore();
    process.env.OPENAI_API_KEY = 'sk-test-valid-key';
  });

  it('exits if OPENAI_API_KEY is invalid', () => {
    jest.resetModules();
    const logger = require('../src/logger');
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit');
    });
    process.env.OPENAI_API_KEY = 'invalid-key';
    logger.error.mockClear();
    expect(() => require('../src/openai')).toThrow('exit');
    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(logger.error).toHaveBeenCalled();
    exitSpy.mockRestore();
    process.env.OPENAI_API_KEY = 'sk-test-valid-key';
  });
});
