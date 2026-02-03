import { Request, Response, NextFunction } from 'express';
import { ZodSchema, ZodError } from 'zod';
import { ErrorResponse } from './errorHandler';

/**
 * Validation middleware factory
 * Creates middleware that validates request data against a Zod schema
 * Requirements: 1.3, 6.3
 */
export const validate = (schema: ZodSchema, source: 'body' | 'query' | 'params' = 'body') => {
  return (req: Request, res: Response, next: NextFunction): void => {
    try {
      const data = source === 'body' ? req.body : source === 'query' ? req.query : req.params;
      const validated = schema.parse(data);
      
      // Replace the original data with validated data
      if (source === 'body') {
        req.body = validated;
      } else if (source === 'query') {
        req.query = validated as any;
      } else {
        req.params = validated as any;
      }
      
      next();
    } catch (error) {
      if (error instanceof ZodError) {
        const requestId = (req.headers['x-request-id'] as string) || 'unknown';
        const errorResponse: ErrorResponse = {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors.map((err) => ({
              path: err.path.join('.'),
              message: err.message,
              code: err.code,
            })),
            timestamp: new Date().toISOString(),
            requestId,
          },
        };
        res.status(400).json(errorResponse);
        return;
      }
      next(error);
    }
  };
};
