const fs = require('fs');
const path = require('path');
const { createLogger, format, transports } = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');

const logDir = path.resolve(__dirname, '..', 'logs');
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

const jsonFormat = format.combine(
  format.timestamp(),
  format.errors({ stack: true }),
  format.splat(),
  format.json()
);

const transportsList = [
  new DailyRotateFile({
    filename: path.join(logDir, 'app-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_MAX_FILES || '14d',
    level: process.env.LOG_FILE_LEVEL || process.env.LOG_LEVEL || 'info',
    format: jsonFormat
  }),
  new DailyRotateFile({
    filename: path.join(logDir, 'error-%DATE%.log'),
    datePattern: 'YYYY-MM-DD',
    zippedArchive: true,
    maxSize: process.env.LOG_MAX_SIZE || '20m',
    maxFiles: process.env.LOG_ERROR_MAX_FILES || '30d',
    level: 'error',
    format: jsonFormat
  })
];

if (process.env.NODE_ENV !== 'production') {
  transportsList.push(
    new transports.Console({
      level: process.env.LOG_CONSOLE_LEVEL || process.env.LOG_LEVEL || 'info',
      format: jsonFormat
    })
  );
}

const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: jsonFormat,
  transports: transportsList
});

module.exports = logger;
