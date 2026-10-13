import type { RequestHandler } from 'express';
import type { Logger } from 'pino';

export function accessLog(logger: Logger): RequestHandler {
  return (req, res, next) => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const durationMs = Number(process.hrtime.bigint() - started) / 1e6;
      logger.info(
        {
          requestId: req.id,
          method: req.method,
          path: req.originalUrl.split('?')[0],
          status: res.statusCode,
          durationMs: Math.round(durationMs),
        },
        'request completed',
      );
    });
    next();
  };
}
