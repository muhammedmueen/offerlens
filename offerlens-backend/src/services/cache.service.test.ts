import cacheService from './cache.service';

describe('CacheService', () => {
  let redisAvailable = false;

  beforeAll(async () => {
    // Wait for Redis connection
    await new Promise((resolve) => setTimeout(resolve, 1000));
    
    // Check if Redis is available
    redisAvailable = await cacheService.ping();
    
    if (!redisAvailable) {
      console.warn('⚠️  Redis is not available. Tests will verify graceful degradation.');
    }
  });

  afterAll(async () => {
    // Clean up and close connection
    await cacheService.close();
  });

  describe('get and set', () => {
    it('should set and get a string value', async () => {
      if (!redisAvailable) {
        // Test graceful degradation
        const key = 'test:string';
        const value = 'hello world';

        await cacheService.set(key, value);
        const result = await cacheService.get<string>(key);

        expect(result).toBeNull(); // Should return null when Redis is unavailable
        return;
      }

      const key = 'test:string';
      const value = 'hello world';

      await cacheService.set(key, value);
      const result = await cacheService.get<string>(key);

      expect(result).toBe(value);

      // Cleanup
      await cacheService.del(key);
    });

    it('should set and get an object value', async () => {
      if (!redisAvailable) {
        const key = 'test:object';
        const value = { name: 'John', age: 30, active: true };

        await cacheService.set(key, value);
        const result = await cacheService.get<typeof value>(key);

        expect(result).toBeNull();
        return;
      }

      const key = 'test:object';
      const value = { name: 'John', age: 30, active: true };

      await cacheService.set(key, value);
      const result = await cacheService.get<typeof value>(key);

      expect(result).toEqual(value);

      // Cleanup
      await cacheService.del(key);
    });

    it('should return null for non-existent key', async () => {
      const result = await cacheService.get('test:nonexistent');
      expect(result).toBeNull();
    });

    it('should set value with TTL', async () => {
      if (!redisAvailable) {
        // Skip TTL test when Redis is unavailable
        return;
      }

      const key = 'test:ttl';
      const value = 'expires soon';

      await cacheService.set(key, value, 1); // 1 second TTL
      const result1 = await cacheService.get<string>(key);
      expect(result1).toBe(value);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));
      const result2 = await cacheService.get<string>(key);
      expect(result2).toBeNull();
    });
  });

  describe('del', () => {
    it('should delete a key', async () => {
      if (!redisAvailable) {
        // Test graceful degradation
        const key = 'test:delete';
        await cacheService.del(key);
        // Should not throw error
        expect(true).toBe(true);
        return;
      }

      const key = 'test:delete';
      const value = 'to be deleted';

      await cacheService.set(key, value);
      const result1 = await cacheService.get<string>(key);
      expect(result1).toBe(value);

      await cacheService.del(key);
      const result2 = await cacheService.get<string>(key);
      expect(result2).toBeNull();
    });
  });

  describe('increment', () => {
    it('should increment a counter', async () => {
      if (!redisAvailable) {
        // Test graceful degradation - should return 0
        const key = 'test:counter';
        const count = await cacheService.increment(key);
        expect(count).toBe(0);
        return;
      }

      const key = 'test:counter';

      const count1 = await cacheService.increment(key);
      expect(count1).toBe(1);

      const count2 = await cacheService.increment(key);
      expect(count2).toBe(2);

      const count3 = await cacheService.increment(key);
      expect(count3).toBe(3);

      // Cleanup
      await cacheService.del(key);
    });

    it('should increment with TTL', async () => {
      if (!redisAvailable) {
        // Skip TTL test when Redis is unavailable
        return;
      }

      const key = 'test:counter:ttl';

      const count1 = await cacheService.increment(key, 1); // 1 second TTL
      expect(count1).toBe(1);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1500));
      
      const count2 = await cacheService.increment(key, 1);
      expect(count2).toBe(1); // Should reset to 1 after expiration
      
      // Cleanup
      await cacheService.del(key);
    });
  });

  describe('ping', () => {
    it('should ping Redis', async () => {
      const result = await cacheService.ping();
      if (redisAvailable) {
        expect(result).toBe(true);
      } else {
        expect(result).toBe(false);
      }
    });
  });

  describe('isReady', () => {
    it('should return connection status', () => {
      const ready = cacheService.isReady();
      expect(typeof ready).toBe('boolean');
    });
  });
});
