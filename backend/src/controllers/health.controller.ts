import { Request, Response } from 'express';
import prisma from '../lib/prisma';
import { cacheService } from '../services';
import logger from '../utils/logger';

/**
 * Health Check Controller
 * Provides liveness and readiness probes for monitoring
 * Requirements: 8.3
 */

/**
 * Liveness probe - checks if the application is running
 * GET /api/v1/health
 * Requirements: 8.3
 */
export const livenessProbe = (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
};

/**
 * Readiness probe - checks if the application is ready to serve traffic
 * Verifies database and Redis connectivity
 * GET /api/v1/health/ready
 * Requirements: 8.3
 */
export const readinessProbe = async (_req: Request, res: Response) => {
  const checks: Record<string, { status: string; message?: string }> = {
    database: { status: 'unknown' },
    redis: { status: 'unknown' },
  };

  let isReady = true;

  // Check database connectivity
  try {
    await prisma.$queryRaw`SELECT 1`;
    checks.database = { status: 'ok' };
  } catch (error) {
    checks.database = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Database connection failed',
    };
    isReady = false;
    logger.error('Database health check failed', { error });
  }

  // Check Redis connectivity
  try {
    const testKey = 'health_check_test';
    const testValue = Date.now().toString();
    await cacheService.set(testKey, testValue, 5);
    const retrieved = await cacheService.get<string>(testKey);
    
    if (retrieved === testValue) {
      checks.redis = { status: 'ok' };
      await cacheService.del(testKey);
    } else {
      checks.redis = {
        status: 'error',
        message: 'Redis read/write verification failed',
      };
      isReady = false;
    }
  } catch (error) {
    checks.redis = {
      status: 'error',
      message: error instanceof Error ? error.message : 'Redis connection failed',
    };
    isReady = false;
    logger.error('Redis health check failed', { error });
  }

  const statusCode = isReady ? 200 : 503;
  res.status(statusCode).json({
    status: isReady ? 'ready' : 'not_ready',
    timestamp: new Date().toISOString(),
    checks,
  });
};

export default {
  livenessProbe,
  readinessProbe,
};
