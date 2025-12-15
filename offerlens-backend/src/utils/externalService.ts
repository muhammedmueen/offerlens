/**
 * Utility for making external service calls with circuit breaker protection
 * Requirements: 10.4 - Circuit breaker for external services
 */

import { CircuitBreaker, createCircuitBreaker } from './circuitBreaker';
import { withRetry, RetryOptions } from './retry';

export interface ExternalServiceOptions {
  name: string;
  circuitBreakerOptions?: {
    failureThreshold?: number;
    successThreshold?: number;
    timeout?: number;
  };
  retryOptions?: RetryOptions;
}

/**
 * Wrapper for external service calls with circuit breaker and retry logic
 */
export class ExternalServiceClient {
  private circuitBreaker: CircuitBreaker;
  private retryOptions: RetryOptions;

  constructor(options: ExternalServiceOptions) {
    this.circuitBreaker = createCircuitBreaker({
      name: options.name,
      ...options.circuitBreakerOptions,
    });
    this.retryOptions = options.retryOptions || {};
  }

  /**
   * Execute an external service call with circuit breaker and retry protection
   */
  async call<T>(fn: () => Promise<T>): Promise<T> {
    return this.circuitBreaker.execute(async () => {
      return withRetry(fn, this.retryOptions);
    });
  }

  /**
   * Get circuit breaker statistics
   */
  getStats() {
    return this.circuitBreaker.getStats();
  }

  /**
   * Reset the circuit breaker
   */
  reset() {
    this.circuitBreaker.reset();
  }
}

/**
 * Example: Create a client for an external API service
 * 
 * Usage:
 * ```typescript
 * const geminiClient = new ExternalServiceClient({
 *   name: 'Gemini API',
 *   circuitBreakerOptions: {
 *     failureThreshold: 5,
 *     timeout: 60000,
 *   },
 *   retryOptions: {
 *     maxAttempts: 3,
 *     initialDelayMs: 1000,
 *   },
 * });
 * 
 * const result = await geminiClient.call(async () => {
 *   const response = await fetch('https://api.gemini.com/...');
 *   return response.json();
 * });
 * ```
 */
