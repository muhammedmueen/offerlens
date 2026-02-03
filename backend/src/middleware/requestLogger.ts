import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import logger from '../utils/logger';
import { trackResponseTime, trackError } from '../services/metrics.service';

/**
 * Hash IP address for privacy-compliant logging
 * Requirements: 6.5, 8.2
 */
const hashIpAddress = (ip: string | undefined): string => {
  if (!ip) return 'unknown';
  return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
};

/**
 * Request logging middleware
 * Logs all requests with timestamp, endpoint, IP hash, and response status
 * Also tracks metrics for monitoring
 * Requirements: 6.5, 8.2
 */
export const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  // Generate request ID
  const requestId = uuidv4();
  req.headers['x-request-id'] = requestId;

  // Get client IP (handles proxies)
  const clientIp = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.ip || req.socket.remoteAddress;
  const ipHash = hashIpAddress(clientIp);

  // Log request
  logger.info('Incoming request', {
    requestId,
    method: req.method,
    endpoint: `${req.method} ${req.path}`,
    path: req.path,
    query: req.query,
    ipHash,
    timestamp: new Date().toISOString(),
  });

  // Capture response time
  const startTime = Date.now();

  // Log response and track metrics
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const timestamp = new Date().toISOString();
    
    logger.info('Request completed', {
      requestId,
      method: req.method,
      endpoint: `${req.method} ${req.path}`,
      path: req.path,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      ipHash,
      timestamp,
    });

    // Track metrics for monitoring
    // Requirements: 8.2
    const metricData = {
      endpoint: `${req.method} ${req.path}`,
      method: req.method,
      statusCode: res.statusCode,
      duration,
      timestamp,
      requestId,
    };

    trackResponseTime(metricData);

    // Track errors (4xx and 5xx status codes)
    if (res.statusCode >= 400) {
      trackError(metricData);
    }
  });

  next();
};
