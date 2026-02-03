/**
 * Retry utility with exponential backoff for transient failures
 * Requirements: 10.4 - Retry logic for transient failures
 */

import logger from './logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryableErrors?: Array<new (...args: any[]) => Error>;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxAttempts: 3,
  initialDelayMs: 100,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
  retryableErrors: [],
};

/**
 * Executes a function with exponential backoff retry logic
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      // Check if error is retryable
      const isRetryable =
        opts.retryableErrors.length === 0 ||
        opts.retryableErrors.some((ErrorClass) => error instanceof ErrorClass);

      if (!isRetryable || attempt === opts.maxAttempts) {
        throw error;
      }

      // Calculate delay with exponential backoff
      const delay = Math.min(
        opts.initialDelayMs * Math.pow(opts.backoffMultiplier, attempt - 1),
        opts.maxDelayMs
      );

      logger.warn('Retrying operation', {
        attempt,
        maxAttempts: opts.maxAttempts,
        delayMs: delay,
        error: lastError.message,
      });

      await sleep(delay);
    }
  }

  throw lastError!;
}

/**
 * Retry specifically for database operations
 * Retries on any error by default (empty retryableErrors array)
 */
export async function withDatabaseRetry<T>(
  fn: () => Promise<T>,
  options: Omit<RetryOptions, 'retryableErrors'> = {}
): Promise<T> {
  return withRetry(fn, {
    ...options,
    // Empty array means retry on all errors
    retryableErrors: [],
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
