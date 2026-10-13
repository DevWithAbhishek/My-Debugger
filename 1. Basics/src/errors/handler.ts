import type { ErrorRequestHandler, RequestHandler } from 'express';
import { ZodError } from 'zod';
import type { Logger } from 'pino';
import { AppError, Errors } from './AppError.js';
import type { AppConfig } from '../config/index.js';

export const notFoundHandler: RequestHandler = (_req, _res, next) => {
  next(Errors.notFound('Route'));
};

export function createErrorHandler(config: AppConfig, logger: Logger): ErrorRequestHandler {
  return (err, req, res, next) => {
    if (res.headersSent) return next(err);

    if (err instanceof AppError) {
      logger.warn({ requestId: req.id, code: err.code, status: err.status }, 'request rejected');
      return res.status(err.status).json({
        error: {
          code: err.code,
          message: err.message,
          details: err.details,
          requestId: req.id ?? null,
        },
      });
    }

    if (err instanceof ZodError) {
      return res.status(422).json({
        error: {
          code: 'INVALID_INPUT',
          message: 'Invalid request body',
          details: err.issues,
          requestId: req.id ?? null,
        },
      });
    }

    logger.error({ requestId: req.id, err: { message: err.message, stack: err.stack } }, 'unhandled error');
    const body: Record<string, unknown> = { status: 'error', message: err.message };
    if (config.nodeEnv !== 'production') body.stack = err.stack;
    return res.status(500).json(body);
  };
}
