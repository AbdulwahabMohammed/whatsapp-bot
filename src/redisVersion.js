const Redis = require('ioredis');

const MIN_REDIS_VERSION = '6.2.0';

function normalizeVersion (version) {
  if (!version) {
    return [];
  }

  return String(version)
    .split('-')[0]
    .split('.')
    .map(segment => {
      const parsed = parseInt(segment, 10);
      return Number.isNaN(parsed) ? 0 : parsed;
    });
}

function compareVersions (current, required) {
  const currentParts = normalizeVersion(current);
  const requiredParts = normalizeVersion(required);
  const length = Math.max(currentParts.length, requiredParts.length);

  for (let index = 0; index < length; index += 1) {
    const currentValue = currentParts[index] ?? 0;
    const requiredValue = requiredParts[index] ?? 0;

    if (currentValue > requiredValue) return 1;
    if (currentValue < requiredValue) return -1;
  }

  return 0;
}

function parseVersionFromInfo (info) {
  if (!info) return null;

  const lines = info.split(/\r?\n/);
  const versionLine = lines
    .map(line => line.trim())
    .find(line => line.toLowerCase().startsWith('redis_version:'));

  if (!versionLine) return null;

  const [, version] = versionLine.split(':');
  return version ? version.trim() : null;
}

async function ensureRedisVersion (options = {}) {
  const {
    url = process.env.REDIS_URL || 'redis://redis:6379',
    minVersion = MIN_REDIS_VERSION
  } = options;

  const redis = new Redis(url, { lazyConnect: true });

  try {
    await redis.connect();
    const info = await redis.info('server');
    const version = parseVersionFromInfo(info);

    if (!version) {
      const error = new Error('Redis version information is unavailable.');
      error.code = 'REDIS_VERSION_UNKNOWN';
      throw error;
    }

    if (compareVersions(version, minVersion) < 0) {
      const error = new Error(`Redis ${minVersion} or newer is required but found ${version}.`);
      error.code = 'REDIS_VERSION_UNSUPPORTED';
      error.currentVersion = version;
      error.requiredVersion = minVersion;
      throw error;
    }

    return version;
  } catch (error) {
    if (!error.code) {
      error.code = 'REDIS_VERSION_CHECK_FAILED';
    }
    throw error;
  } finally {
    redis.disconnect();
  }
}

module.exports = {
  MIN_REDIS_VERSION,
  ensureRedisVersion,
  parseVersionFromInfo,
  compareVersions,
  isVersionAtLeast: (current, required) => compareVersions(current, required) >= 0
};
