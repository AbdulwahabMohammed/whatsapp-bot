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

jest.mock('../src/db', () => ({
  query: jest.fn()
}));

const pool = require('../src/db');

const app = require('../src/admin');
const { createOrganization } = require('../src/index');

describe('admin routes', () => {
  beforeEach(() => {
    const hash = bcrypt.hashSync('secret', 10);
    pool.query.mockImplementation(async text => {
      if (text.includes('SELECT password_hash')) {
        return { rows: [{ password_hash: hash, role: 'admin' }] };
      }
      return { rows: [] };
    });
  });

  afterEach(() => {
    pool.query.mockReset();
  });

  it('creates organization', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret');
    await agent.post('/org/new').send('name=Test&phone=123');
    expect(createOrganization).toHaveBeenCalledWith('Test', '123', undefined, undefined);
  });

  it('lists organizations', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret');
    await agent.get('/').expect(200);
  });

  it('serves metrics', async () => {
    await request(app).get('/metrics').expect(200);
  });

  it('serves stats page', async () => {
    const agent = request.agent(app);
    await agent.post('/login').send('username=admin&password=secret');
    await agent.get('/stats').expect(200);
  });
});
