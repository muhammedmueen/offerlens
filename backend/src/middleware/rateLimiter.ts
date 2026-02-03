import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import cacheService from '../services/cache.service';
import config from '../config';
import logger from '../utils/logger';
import { ErrorResponse } from './errorHandler';

/**
 * Rate limiter configuration
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyPrefix?: string; // Prefix for Redis keys
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

/**
 * Get client identifier for rate limiting
 * Uses IP address hash for privacy
 * Requirements: 6.1, 6.2
 */
const getClientIdentifier = (req: Request): string => {
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress || 'unknown';
  return crypto.createHash('sha256').update(clientIp).digest('hex').substring(0, 16);
};

/**
 * Rate limiter middleware factory
 * Enforces request limits per IP address within configurable time windows
 * Requirements: 6.1, 6.2
 */
export const rateLimiter = (customConfig?: Partial<RateLimitConfig>) => {
  const rateLimitConfig: RateLimitConfig = {
    windowMs: config.rateLimit.windowMs,
    maxRequests: config.rateLimit.maxRequests,
    keyPrefix: 'ratelimit',
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    ...customConfig,
  };

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const clientId = getClientIdentifier(req);
      const key = `${rateLimitConfig.keyPrefix}:${clientId}`;
      const windowSeconds = Math.ceil(rateLimitConfig.windowMs / 1000);

      // Increment request counter
      const requestCount = await cacheService.increment(key, windowSeconds);

      // Set rate limit headers
      res.setHeader('X-RateLimit-Limit', rateLimitConfig.maxRequests);
      res.setHeader('X-RateLimit-Remaining', Math.max(0, rateLimitConfig.maxRequests - requestCount));
      res.setHeader('X-RateLimit-Reset', new Date(Date.now() + rateLimitConfig.windowMs).toISOString());

      // Check if rate limit exceeded
      if (requestCount > rateLimitConfig.maxRequests) {
        const requestId = (req.headers['x-request-id'] as string) || 'unknown';
        const retryAfter = Math.ceil(rateLimitConfig.windowMs / 1000);

        logger.warn('Rate limit exceeded', {
          clientId,
          requestCount,
          maxRequests: rateLimitConfig.maxRequests,
          endpoint: `${req.method} ${req.path}`,
          requestId,
        });

        // Set Retry-After header
        res.setHeader('Retry-After', retryAfter);

        const errorResponse: ErrorResponse = {
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests. Please try again later.',
            details: {
              retryAfter: `${retryAfter} seconds`,
              limit: rateLimitConfig.maxRequests,
              windowMs: rateLimitConfig.windowMs,
            },
            timestamp: new Date().toISOString(),
            requestId,
          },
        };

        res.status(429).json(errorResponse);
        return;
      }

      // If configured to skip counting based on response status, set up listener
      if (rateLimitConfig.skipSuccessfulRequests || rateLimitConfig.skipFailedRequests) {
        res.on('finish', async () => {
          const shouldSkip =
            (rateLimitConfig.skipSuccessfulRequests && res.statusCode < 400) ||
            (rateLimitConfig.skipFailedRequests && res.statusCode >= 400);

          if (shouldSkip) {
            // Decrement the counter since we're skipping this request
            try {
              const client = cacheService.getClient();
              await client.decr(key);
            } catch (error) {
              logger.error('Error decrementing rate limit counter:', error);
            }
          }
        });
      }

      next();
    } catch (error) {
      // If rate limiting fails, log error but allow request through (graceful degradation)
      logger.error('Rate limiter error:', error);
      next();
    }
  };
};

/**
 * Predefined rate limiters for different endpoints
 */

// Standard rate limiter (10 requests per minute)
export const standardRateLimiter = rateLimiter();

// Strict rate limiter for analysis endpoint (5 requests per minute)
export const analysisRateLimiter = rateLimiter({
  maxRequests: 5,
  windowMs: 60000, // 1 minute
  keyPrefix: 'ratelimit:analysis',
});

// Lenient rate limiter for read-only endpoints (100 requests per minute)
export const readOnlyRateLimiter = rateLimiter({
  maxRequests: 100,
  windowMs: 60000, // 1 minute
  keyPrefix: 'ratelimit:readonly',
});

// Auth rate limiter (5 attempts per 15 minutes)
export const authRateLimiter = rateLimiter({
  maxRequests: 5,
  windowMs: 900000, // 15 minutes
  keyPrefix: 'ratelimit:auth',
});
