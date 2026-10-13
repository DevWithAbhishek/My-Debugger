import { randomUUID } from 'node:crypto';
import type { RequestHandler } from 'express';
import { requestContext } from '../observability/logger.js';

const SAFE_ID = /^[A-Za-z0-9._-]{8,64}$/;

export function requestId(): RequestHandler {
  return (req, res, next) => {
    const inbound = req.header('x-request-id');
    const id = inbound && SAFE_ID.test(inbound) ? inbound : randomUUID();
    req.id = id;
    res.setHeader('X-Request-Id', id);
    requestContext.run({ requestId: id }, next);
  };
}
