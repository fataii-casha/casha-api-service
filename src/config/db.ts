import { AppDataSource } from './data-source';
import { logger } from './logger';

export async function connectDB(): Promise<void> {
  await AppDataSource.initialize();
  logger.info('PostgreSQL connected (TypeORM)');
}

export async function disconnectDB(): Promise<void> {
  await AppDataSource.destroy();
}
