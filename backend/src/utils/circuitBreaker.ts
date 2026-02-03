/**
 * Circuit Breaker pattern implementation for external services
 * Requirements: 10.4 - Circuit breaker for external services
 * 
 * States:
 * - CLOSED: Normal operation, requests pass through
 * - OPEN: Circuit is open, requests fail fast
 * - HALF_OPEN: Testing if service recovered, limited requests pass through
 */

import logger from './logger';

export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold?: number; // Number of failures before opening circuit
  successThreshold?: number; // Number of successes to close circuit from half-open
  timeout?: number; // Time in ms before attempting to close circuit
  name?: string; // Name for logging
}

const DEFAULT_OPTIONS: Required<CircuitBreakerOptions> = {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
  name: 'CircuitBreaker',
};

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED;
  private failureCount = 0;
  private successCount = 0;
  private nextAttempt = Date.now();
  private readonly options: Required<CircuitBreakerOptions>;

  constructor(options: CircuitBreakerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        const error = new Error(
          `Circuit breaker is OPEN for ${this.options.name}`
        );
        logger.warn('Circuit breaker preventing request', {
          name: this.options.name,
          state: this.state,
          nextAttempt: new Date(this.nextAttempt).toISOString(),
        });
        throw error;
      }

      // Transition to half-open to test service
      this.state = CircuitState.HALF_OPEN;
      this.successCount = 0;
      logger.info('Circuit breaker transitioning to HALF_OPEN', {
        name: this.options.name,
      });
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++;

      if (this.successCount >= this.options.successThreshold) {
        this.state = CircuitState.CLOSED;
        logger.info('Circuit breaker closed', {
          name: this.options.name,
          successCount: this.successCount,
        });
      }
    }
  }

  private onFailure(): void {
    this.failureCount++;

    if (
      this.state === CircuitState.HALF_OPEN ||
      this.failureCount >= this.options.failureThreshold
    ) {
      this.state = CircuitState.OPEN;
      this.nextAttempt = Date.now() + this.options.timeout;

      logger.error('Circuit breaker opened', {
        name: this.options.name,
        failureCount: this.failureCount,
        nextAttempt: new Date(this.nextAttempt).toISOString(),
      });
    }
  }

  /**
   * Get current circuit state
   */
  getState(): CircuitState {
    return this.state;
  }

  /**
   * Get circuit statistics
   */
  getStats() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      nextAttempt: new Date(this.nextAttempt).toISOString(),
    };
  }

  /**
   * Manually reset the circuit breaker
   */
  reset(): void {
    this.state = CircuitState.CLOSED;
    this.failureCount = 0;
    this.successCount = 0;
    this.nextAttempt = Date.now();
    logger.info('Circuit breaker manually reset', {
      name: this.options.name,
    });
  }
}

/**
 * Create a circuit breaker instance for a specific service
 */
export function createCircuitBreaker(
  options: CircuitBreakerOptions
): CircuitBreaker {
  return new CircuitBreaker(options);
}
