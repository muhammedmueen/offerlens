import { Request, Response, NextFunction } from 'express';
import { sanitizeObject, containsXss, containsSqlInjection, sanitizeText } from '../utils/sanitization';
import { ErrorResponse } from './errorHandler';
import logger from '../utils/logger';

/**
 * Sanitization middleware
 * Sanitizes request body to prevent XSS and SQL injection attacks
 * Requirements: 6.3, 6.4
 */
export const sanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    // Check for malicious patterns before sanitization
    const bodyString = JSON.stringify(req.body);
    
    if (containsXss(bodyString)) {
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      
      logger.warn('XSS attempt detected', {
        requestId,
        endpoint: `${req.method} ${req.path}`,
        ipHash: req.headers['x-client-ip-hash'],
      });

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INVALID_INPUT',
          message: 'Input contains potentially dangerous content',
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(400).json(errorResponse);
      return;
    }

    if (containsSqlInjection(bodyString)) {
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      
      logger.warn('SQL injection attempt detected', {
        requestId,
        endpoint: `${req.method} ${req.path}`,
        ipHash: req.headers['x-client-ip-hash'],
      });

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INVALID_INPUT',
          message: 'Input contains potentially dangerous content',
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(400).json(errorResponse);
      return;
    }

    // Sanitize request body
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body, sanitizeText);
    }

    // Sanitize query parameters
    if (req.query && typeof req.query === 'object') {
      req.query = sanitizeObject(req.query as Record<string, any>, sanitizeText);
    }

    next();
  } catch (error) {
    logger.error('Sanitization middleware error:', error);
    next(error);
  }
};

/**
 * Strict sanitization middleware for text-heavy endpoints
 * More aggressive sanitization for offer text and descriptions
 */
export const strictSanitizeInput = (req: Request, res: Response, next: NextFunction): void => {
  try {
    const bodyString = JSON.stringify(req.body);
    
    // More strict checks for text-heavy content
    if (containsXss(bodyString) || containsSqlInjection(bodyString)) {
      const requestId = (req.headers['x-request-id'] as string) || 'unknown';
      
      logger.warn('Malicious content detected in strict sanitization', {
        requestId,
        endpoint: `${req.method} ${req.path}`,
      });

      const errorResponse: ErrorResponse = {
        error: {
          code: 'INVALID_INPUT',
          message: 'Input contains potentially dangerous content',
          timestamp: new Date().toISOString(),
          requestId,
        },
      };

      res.status(400).json(errorResponse);
      return;
    }

    // Apply sanitization
    if (req.body && typeof req.body === 'object') {
      req.body = sanitizeObject(req.body, sanitizeText);
    }

    next();
  } catch (error) {
    logger.error('Strict sanitization middleware error:', error);
    next(error);
  }
};
