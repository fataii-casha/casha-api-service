import pino from 'pino';
import { isProd } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
