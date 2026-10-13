import { createApp } from './app.js';
import { loadConfig } from './config/index.js';
import { createLogger } from './observability/logger.js';
import { createPool } from './services/db.js';
import { createRedis } from './services/redis.js';

const config = loadConfig();
const logger = createLogger();
const pool = createPool(config, logger);
const redis = createRedis(config, logger);
const { app, prime } = createApp({ config, logger, pool, redis });

const server = app.listen(config.port as never, config.host, () => {
  logger.info({ port: config.port, host: config.host, env: config.nodeEnv }, 'server listening');
});

redis.connect().then(
  () => logger.info('redis connected'),
  (err: Error) => logger.error({ err: err.message }, 'redis connection failed'),
);
prime().then(
  () => logger.info('database connected'),
  (err: Error) => logger.error({ err: err.message }, 'database connection failed'),
);

process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down');
  redis.quit().catch(() => undefined);
  setTimeout(() => process.exit(0), 100);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down');
  process.exit(0);
});

export { server };
