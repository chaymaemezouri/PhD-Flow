import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiError } from '@scholarflow/types';
import type { Request, Response } from 'express';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const response = http.getResponse<Response>();
    const request = http.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const message = this.resolveMessage(exception, status);
    const requestId =
      request.id === undefined || request.id === null || request.id === ''
        ? null
        : String(request.id);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `${request.method} ${request.originalUrl} failed`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const body: ApiError = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: request.originalUrl,
      timestamp: new Date().toISOString(),
      requestId,
    };

    response.status(status).json(body);
  }

  private resolveMessage(exception: unknown, status: number): string {
    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      return 'Internal server error';
    }

    if (!(exception instanceof HttpException)) {
      return 'Request failed';
    }

    const payload = exception.getResponse();
    if (typeof payload === 'string') {
      return payload;
    }

    if (typeof payload === 'object' && payload !== null && 'message' in payload) {
      const raw: unknown = payload.message;
      if (Array.isArray(raw)) {
        return raw.map((item) => String(item)).join('; ');
      }
      if (typeof raw === 'string') {
        return raw;
      }
    }

    return exception.message;
  }
}
