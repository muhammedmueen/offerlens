import { PrismaClient } from '@prisma/client';
import logger from '../utils/logger';
import { withDatabaseRetry } from '../utils/retry';

// Prisma Client singleton
// This ensures we only have one instance of PrismaClient across the application

const globalForPrisma = global as unknown as { prisma: PrismaClient };

export const prisma =
  globalForPrisma.prisma ||
  new PrismaClient({
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
process.on('beforeExit', async () => {
  logger.info('Disconnecting Prisma Client...');
  await prisma.$disconnect();
});

/**
 * Execute a Prisma query with retry logic for transient failures
 * Requirements: 10.4 - Retry logic for database operations
 */
export async function withPrismaRetry<T>(
  fn: () => Promise<T>
): Promise<T> {
  return withDatabaseRetry(fn, {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });
}

export default prisma;
