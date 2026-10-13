import { AsyncLocalStorage } from 'node:async_hooks';
import pino, { type DestinationStream, type Logger } from 'pino';

export interface RequestContext {
  requestId: string;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function createLogger(destination?: DestinationStream, level = process.env.LOG_LEVEL ?? 'info'): Logger {
  return pino(
    {
      level,
      base: { service: 'ims-api' },
      timestamp: pino.stdTimeFunctions.isoTime,
      mixin() {
        const ctx = requestContext.getStore();
        return ctx ? { requestId: ctx.requestId } : {};
      },
    },
    destination,
  );
}
