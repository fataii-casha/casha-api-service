import { NextFunction, Request, Response } from 'express';
import { MulterError } from 'multer';
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

  if (err instanceof MulterError) {
    return res.status(400).json({
      success: false,
      message: multerErrorMessage(err),
      details: { code: err.code, field: err.field },
    });
  }

  logger.error({ err }, 'Unhandled error');

  return res.status(500).json({
    success: false,
    message: isProd ? 'Internal server error' : err.message,
    ...(isProd ? {} : { stack: err.stack }),
  });
}

function multerErrorMessage(err: MulterError): string {
  switch (err.code) {
    case 'LIMIT_FILE_SIZE':
      return 'File is too large. Maximum size is 5MB';
    case 'LIMIT_UNEXPECTED_FILE':
      return `Unexpected file field: ${err.field}`;
    default:
      return err.message;
  }
}
