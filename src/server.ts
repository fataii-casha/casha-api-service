import 'reflect-metadata';
import { createApp } from './app';
import { connectDB, disconnectDB } from './config/db';
import { connectRedis, disconnectRedis } from './config/redis';
import { env } from './config/env';
import { logger } from './config/logger';
import { finalizeDueStashDeletions } from './modules/wallet/stash.service';

const STASH_DELETION_CHECK_MS = 60 * 60 * 1000; // hourly

async function main() {
  await connectDB();
  await connectRedis();

  const app = createApp();
  const server = app.listen(env.port, () => {
    logger.info(`Casha API listening on port ${env.port} [${env.nodeEnv}]`);
    logger.info(`API docs: http://localhost:${env.port}/api-docs`);
  });

  // Deleted stashes become permanent after their 30 days. Reads already hide overdue ones,
  // so running this hourly (and on every instance) is fine.
  const runStashDeletions = () =>
    finalizeDueStashDeletions().catch((err) =>
      logger.error({ err }, 'Finalizing stash deletions failed'),
    );
  void runStashDeletions();
  const stashDeletionTimer = setInterval(runStashDeletions, STASH_DELETION_CHECK_MS);
  stashDeletionTimer.unref();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down gracefully...`);
    clearInterval(stashDeletionTimer);
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
