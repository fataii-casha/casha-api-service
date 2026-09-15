import { NextFunction, Request, Response } from 'express';
import { ApiError } from '../utils/api-error';
import { logger } from '../config/logger';
import { isProd } from '../config/env';

export function notFoundHandler(req: Request, _res: Response, next: NextFunction) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ApiError) {
    if (!err.isOperational) {
      logger.error({ err }, 'Non-operational error');
    }
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      ...(err.details ? { details: err.details } : {}),
    });
  }

  logger.error({ err }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}
