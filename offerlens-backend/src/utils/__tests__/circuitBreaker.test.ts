import { CircuitBreaker, CircuitState } from '../circuitBreaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      timeout: 1000,
      name: 'TestService',
    });
  });

  describe('CLOSED state', () => {
    it('should allow requests when circuit is closed', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await circuitBreaker.execute(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
    });

    it('should open circuit after failure threshold', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Fail 3 times to reach threshold
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow('Service error');
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(fn).toHaveBeenCalledTimes(3);
    });
  });

  describe('OPEN state', () => {
    beforeEach(async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }
    });

    it('should reject requests immediately when circuit is open', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      await expect(circuitBreaker.execute(fn)).rejects.toThrow(
        'Circuit breaker is OPEN'
      );

      expect(fn).not.toHaveBeenCalled();
      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      // Wait for timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      await circuitBreaker.execute(fn);

      expect(fn).toHaveBeenCalled();
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);
    });
  });

  describe('HALF_OPEN state', () => {
    beforeEach(async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Service error'));
      
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      // Wait for timeout to transition to HALF_OPEN
      await new Promise((resolve) => setTimeout(resolve, 1100));
    });

    it('should close circuit after success threshold', async () => {
      const fn = jest.fn().mockResolvedValue('success');

      // Need 2 successes to close
      await circuitBreaker.execute(fn);
      expect(circuitBreaker.getState()).toBe(CircuitState.HALF_OPEN);

      await circuitBreaker.execute(fn);
      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('should reopen circuit on failure in HALF_OPEN state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Still failing'));

      await expect(circuitBreaker.execute(fn)).rejects.toThrow('Still failing');

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);
      expect(fn).toHaveBeenCalledTimes(1);
    });
  });

  describe('getStats', () => {
    it('should return circuit statistics', () => {
      const stats = circuitBreaker.getStats();

      expect(stats).toHaveProperty('state');
      expect(stats).toHaveProperty('failureCount');
      expect(stats).toHaveProperty('successCount');
      expect(stats).toHaveProperty('nextAttempt');
    });
  });

  describe('reset', () => {
    it('should reset circuit to CLOSED state', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Service error'));

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await expect(circuitBreaker.execute(fn)).rejects.toThrow();
      }

      expect(circuitBreaker.getState()).toBe(CircuitState.OPEN);

      circuitBreaker.reset();

      expect(circuitBreaker.getState()).toBe(CircuitState.CLOSED);
      expect(circuitBreaker.getStats().failureCount).toBe(0);
    });
  });
});
