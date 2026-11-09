import pino from 'pino';
import { isProd } from './env';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  // pino-http logs every request's headers — keep bearer tokens and cookies out of the logs.
  redact: ['req.headers.authorization', 'req.headers.cookie'],
  transport: isProd
    ? undefined
    : {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname' },
      },
});
