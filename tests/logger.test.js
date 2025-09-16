const { Writable } = require('stream');
const { transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logger = require('../src/logger');

describe('logger configuration', () => {
  test('emits JSON formatted logs with level, message, timestamp and metadata', async () => {
    const logs = [];
    let resolveLog;
    const logCaptured = new Promise((resolve) => {
      resolveLog = resolve;
    });

    const stream = new Writable({
      write: function (chunk, encoding, callback) {
        logs.push(chunk.toString());
        callback();
        resolveLog();
      }
    });

    const testTransport = new transports.Stream({ stream, format: logger.format });
    logger.add(testTransport);

    logger.info('structured test', { correlationId: 'abc123' });

    await logCaptured;
    logger.remove(testTransport);

    expect(logs).toHaveLength(1);
    const entry = JSON.parse(logs[0]);
    expect(entry.level).toBe('info');
    expect(entry.message).toBe('structured test');
    expect(entry.timestamp).toBeDefined();
    expect(entry.correlationId).toBe('abc123');
  });

  test('registers a daily rotate file transport', () => {
    const hasDailyRotate = logger.transports.some((transportInstance) =>
      transportInstance instanceof DailyRotateFile
    );

    expect(hasDailyRotate).toBe(true);
  });
});

afterAll(() => {
  logger.close();
});
