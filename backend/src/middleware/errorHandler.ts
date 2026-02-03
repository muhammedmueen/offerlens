import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
    timestamp: string;
    requestId: string;
  };
}

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void => {
  const requestId = (req.headers['x-request-id'] as string) || 'unknown';

  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    requestId,
    path: req.path,
    method: req.method,
  });

  // Handle Zod validation errors
  if (err instanceof ZodError) {
    const errorResponse: ErrorResponse = {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request data',
        details: err.errors,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };
    res.status(400).json(errorResponse);
    return;
  }

  // Handle custom AppError
  if (err instanceof AppError) {
    const errorResponse: ErrorResponse = {
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
        timestamp: new Date().toISOString(),
        requestId,
      },
    };
    res.status(err.statusCode).json(errorResponse);
    return;
  }

  // Handle unknown errors
  const errorResponse: ErrorResponse = {
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: 'An unexpected error occurred',
      timestamp: new Date().toISOString(),
      requestId,
    },
  };

  res.status(500).json(errorResponse);
};

export const notFoundHandler = (req: Request, res: Response) => {
  const requestId = (req.headers['x-request-id'] as string) || 'unknown';
  const errorResponse: ErrorResponse = {
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.path} not found`,
      timestamp: new Date().toISOString(),
      requestId,
    },
  };
  res.status(404).json(errorResponse);
};
