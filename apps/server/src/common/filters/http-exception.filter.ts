import {
  Catch,
  HttpException,
  Logger,
  type ArgumentsHost,
  type ExceptionFilter,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import type { ApiErrorBody } from '@cowatch/types';

const CODE_BY_STATUS: Record<number, string> = {
  400: 'VALIDATION_ERROR',
  401: 'UNAUTHENTICATED',
  403: 'FORBIDDEN',
  404: 'NOT_FOUND',
  409: 'CONFLICT',
  422: 'UNPROCESSABLE',
  429: 'RATE_LIMITED',
};

/**
 * Maps every thrown error onto the canon §10 error envelope:
 * `{ error: { code, message, details?, correlationId } }`. Custom thrown
 * payloads of the form `{ code, message }` are honored; class-validator's
 * message arrays become `details`.
 */
@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();

    let status = 500;
    let code = 'INTERNAL_ERROR';
    let message = 'Internal server error.';
    let details: Record<string, string[]> | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      code = CODE_BY_STATUS[status] ?? 'ERROR';
      const payload = exception.getResponse();
      if (typeof payload === 'string') {
        message = payload;
      } else if (payload !== null && typeof payload === 'object') {
        const obj = payload as Record<string, unknown>;
        if (typeof obj.code === 'string') code = obj.code;
        if (typeof obj.message === 'string') {
          message = obj.message;
        } else if (Array.isArray(obj.message)) {
          const msgs = obj.message.filter(
            (m): m is string => typeof m === 'string',
          );
          message = 'Validation failed.';
          details = { _: msgs };
        }
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    const headerId = req.headers['x-correlation-id'];
    const correlationId =
      typeof headerId === 'string' && headerId.length > 0
        ? headerId
        : randomUUID();

    const bodyOut: ApiErrorBody = {
      error: {
        code,
        message,
        ...(details ? { details } : {}),
        correlationId,
      },
    };
    res.status(status).json(bodyOut);
  }
}
