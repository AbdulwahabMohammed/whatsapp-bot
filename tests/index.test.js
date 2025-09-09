jest.mock('../src/db', () => ({
  query: jest.fn().mockRejectedValue(new Error('DB connection failed'))
}));

jest.mock('../src/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

const { start } = require('../src/index');
const logger = require('../src/logger');

describe('start', () => {
  it('logs error and exits with code 1 when DB connection fails', async () => {
    const exitSpy = jest.spyOn(process, 'exit').mockImplementation(() => {});

    await start();

    expect(logger.error).toHaveBeenCalledWith('Failed to create/list organizations', {
      error: 'DB connection failed',
      stack: expect.any(String)
    });
    expect(exitSpy).toHaveBeenCalledWith(1);

    exitSpy.mockRestore();
  });
});
