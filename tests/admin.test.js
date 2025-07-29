const request = require('supertest');

process.env.ADMIN_PASSWORD = 'secret';

jest.mock('../src/index', () => ({
  createOrganization: jest.fn(async (n, p, i) => ({ id: 1, name: n, phone: p, instructions: i })),
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

const app = require('../src/admin');
const { createOrganization } = require('../src/index');

describe('admin routes', () => {
  it('creates organization', async () => {
    await request(app)
      .post('/org/new')
      .auth('user', 'secret')
      .send('name=Test&phone=123');
    expect(createOrganization).toHaveBeenCalledWith('Test', '123', undefined);
  });

  it('lists organizations', async () => {
    await request(app)
      .get('/')
      .auth('u', 'secret')
      .expect(200);
  });
});
