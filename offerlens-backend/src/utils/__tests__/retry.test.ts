import { withRetry, withDatabaseRetry } from '../retry';

describe('Retry Utility', () => {
  describe('withRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure and eventually succeed', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw error after max attempts', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Persistent failure'));

      await expect(
        withRetry(fn, { maxAttempts: 3, initialDelayMs: 10 })
      ).rejects.toThrow('Persistent failure');
      
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should respect exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 100,
        backoffMultiplier: 2,
      });
      const duration = Date.now() - startTime;

      // Should have delays of ~100ms and ~200ms
      expect(duration).toBeGreaterThanOrEqual(300);
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should not retry non-retryable errors', async () => {
      class CustomError extends Error {}
      class RetryableError extends Error {}

      const fn = jest.fn().mockRejectedValue(new CustomError('Non-retryable'));

      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          initialDelayMs: 10,
          retryableErrors: [RetryableError],
        })
      ).rejects.toThrow('Non-retryable');
      
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should cap delay at maxDelayMs', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Failure 1'))
        .mockRejectedValueOnce(new Error('Failure 2'))
        .mockResolvedValue('success');

      const startTime = Date.now();
      await withRetry(fn, {
        maxAttempts: 3,
        initialDelayMs: 1000,
        maxDelayMs: 500,
        backoffMultiplier: 2,
      });
      const duration = Date.now() - startTime;

      // Both delays should be capped at 500ms
      expect(duration).toBeLessThan(1500);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('withDatabaseRetry', () => {
    it('should retry database operations', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Connection lost'))
        .mockResolvedValue('success');

      const result = await withDatabaseRetry(fn, { initialDelayMs: 10 });
      
      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});
