const { dispatchScheduled } = require('../src/scheduler');

jest.mock('../src/queue', () => ({ messageQueue: { add: jest.fn() } }));
jest.mock('../src/db', () => ({ query: jest.fn() }));
jest.mock('../src/logger', () => ({ info: jest.fn(), error: jest.fn() }));

const pool = require('../src/db');
const { messageQueue } = require('../src/queue');

describe('dispatchScheduled', () => {
  beforeEach(() => {
    pool.query.mockReset();
    messageQueue.add.mockReset();
  });

  test('sends due messages only once', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ organization_id: 1, phone: '123', text: 'hi' }] });
    await dispatchScheduled();
    expect(messageQueue.add).toHaveBeenCalledWith('send', expect.objectContaining({
      orgId: 1,
      sender: '123',
      text: 'hi'
    }));
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await dispatchScheduled();
    expect(messageQueue.add).toHaveBeenCalledTimes(1);
  });

  test('cleans old messages', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });
    await dispatchScheduled();
    expect(pool.query.mock.calls[0][0]).toContain('INTERVAL');
  });
});
