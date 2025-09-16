const request = require('supertest');
const bcrypt = require('bcrypt');
const { postWithCsrf } = require('./utils/csrf');

const ORIGINAL_ENV = { ...process.env };

describe('admin session configuration', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  function loadAdminModuleWithMocks ({ dbMock } = {}) {
    let adminModule;
    jest.isolateModules(() => {
      jest.doMock('../src/logger', () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn() }));
      jest.doMock('../src/metrics', () => ({
        client: { register: { contentType: 'text/plain', metrics: jest.fn(async () => '') } },
        requestCounter: { inc: jest.fn() },
        connectionGauge: { get: jest.fn(() => ({ values: [] })), labels: () => ({ set: jest.fn() }) },
        queueLengthGauge: { set: jest.fn() }
      }));
      jest.doMock('../src/queue', () => ({
        messageQueue: { close: jest.fn(async () => {}) },
        bulkQueue: { add: jest.fn() },
        getQueueLength: jest.fn(async () => 0)
      }));
      jest.doMock('../src/assistant', () => ({ createAssistant: jest.fn() }));
      jest.doMock('../src/scripts/uploadFile', () => ({
        upload: jest.fn(),
        formatAllowedFileTypes: jest.fn(() => '.txt (text/plain)'),
        formatFileSize: jest.fn(() => '10.00 MB'),
        MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024
      }));
      jest.doMock('../src/index', () => ({
        createOrganization: jest.fn(),
        listOrganizations: jest.fn(async () => [])
      }));
      jest.doMock('../src/botManager', () => ({
        startBot: jest.fn(),
        stopBot: jest.fn(),
        getBotStatus: jest.fn(() => 'stopped'),
        events: { on: jest.fn() }
      }));
      jest.doMock(
        'csurf',
        () =>
          jest.fn(
            () => (req, res, next) => {
              req.csrfToken = () => 'test-csrf-token';
              next();
            }
          ),
        { virtual: true }
      );
      jest.doMock('speakeasy', () => ({
        totp: { verify: jest.fn(() => true) },
        generateSecret: jest.fn(() => ({ base32: 'AAAA', otpauth_url: 'otpauth://' }))
      }));
      jest.doMock('qrcode', () => ({ toDataURL: jest.fn(async () => 'data:image/png;base64,AAA') }));

      if (dbMock) {
        jest.doMock('../src/db', () => dbMock);
      } else {
        jest.doMock('../src/db', () => ({ query: jest.fn() }));
      }

      adminModule = require('../src/admin');
    });

    return adminModule;
  }

  it('throws if SESSION_SECRET is missing', () => {
    delete process.env.SESSION_SECRET;

    expect(() => loadAdminModuleWithMocks()).toThrow('SESSION_SECRET environment variable is required');
  });

  it('sets secure cookie attributes on the session', async () => {
    process.env.SESSION_SECRET = 'test-secret';
    process.env.NODE_ENV = 'production';

    const hash = bcrypt.hashSync('secret', 10);
    const dbMock = {
      query: jest.fn(async text => {
        if (text.includes('SELECT password_hash')) {
          return {
            rows: [
              {
                password_hash: hash,
                role: 'admin',
                totp_secret: null,
                organization_id: null
              }
            ]
          };
        }
        if (text.startsWith('SELECT role, totp_secret')) {
          return { rows: [{ role: 'admin', totp_secret: null }] };
        }
        if (text.startsWith('SELECT totp_secret FROM users')) {
          return { rows: [{ totp_secret: null }] };
        }
        return { rows: [] };
      })
    };

    const { app } = loadAdminModuleWithMocks({ dbMock });
    const agent = request.agent(app);

    const response = await postWithCsrf(
      agent,
      '/login',
      { username: 'admin', password: 'secret' },
      {
        tokenPath: '/login',
        headers: { 'X-Forwarded-Proto': 'https' },
        redirects: 0
      }
    );

    const cookies = response.headers['set-cookie'];
    expect(cookies).toBeDefined();
    const sessionCookie = cookies.find(cookie => cookie.startsWith('connect.sid='));
    expect(sessionCookie).toBeDefined();
    expect(sessionCookie).toContain('HttpOnly');
    expect(sessionCookie).toContain('SameSite=Lax');
    expect(sessionCookie).toContain('Secure');
  });
});
