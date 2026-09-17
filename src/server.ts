import 'reflect-metadata';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';

async function main() {
  await connectDB();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Casha API listening on port ${env.port} [${env.nodeEnv}]`);
    logger.info(`API docs: http://localhost:${env.port}/api-docs`);
  });
  console.log('ENV CHECK:', {
    NODE_ENV: process.env.NODE_ENV,
    PORT: process.env.PORT,
    API_URL: process.env.API_URL,
    STAGING_API_URL: process.env.STAGING_API_URL,
    PRODUCTION_API_URL: process.env.PRODUCTION_API_URL,
  });
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    server.close(async () => {
      await disconnectDB();
      await disconnectRedis();
      process.exit(0);
    });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

main().catch((err) => {
  logger.error({ err }, 'Failed to start server');
  process.exit(1);
});
