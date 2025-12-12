import Redis, { RedisOptions } from 'ioredis';
import config from '../config';
import logger from '../utils/logger';

/**
 * CacheService provides a wrapper around Redis with connection pooling,
 * retry logic, and graceful error handling.
 * 
 * Requirements: 11.3 - Caching for performance optimization
 */
class CacheService {
  private client: Redis;
  private isConnected: boolean = false;

  constructor() {
    const redisOptions: RedisOptions = {
      // Connection pooling configuration
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      enableOfflineQueue: true,
      
      // Retry strategy with exponential backoff
      retryStrategy: (times: number) => {
        const delay = Math.min(times * 50, 2000);
        logger.warn(`Redis connection retry attempt ${times}, waiting ${delay}ms`);
        return delay;
      },
      
      // Reconnect on error
      reconnectOnError: (err: Error) => {
        const targetError = 'READONLY';
        if (err.message.includes(targetError)) {
          // Reconnect when Redis is in readonly mode
          return true;
        }
        return false;
      },
    };

    this.client = new Redis(config.redis.url, redisOptions);

    // Connection event handlers
    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
      this.isConnected = true;
    });

    this.client.on('error', (err: Error) => {
      logger.error('Redis client error:', err);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis client connection closed');
      this.isConnected = false;
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });
  }

  /**
   * Get a value from cache
   * @param key - Cache key
   * @returns Parsed value or null if not found or error occurs
   */
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache get');
        return null;
      }

      const value = await this.client.get(key);
      
      if (!value) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      // Graceful degradation - log error but don't throw
      logger.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache
   * @param key - Cache key
   * @param value - Value to cache
   * @param ttl - Time to live in seconds (optional)
   */
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache set');
        return;
      }

      const serialized = JSON.stringify(value);

      if (ttl) {
        await this.client.setex(key, ttl, serialized);
      } else {
        await this.client.set(key, serialized);
      }
    } catch (error) {
      // Graceful degradation - log error but don't throw
      logger.error(`Cache set error for key ${key}:`, error);
    }
  }

  /**
   * Delete a value from cache
   * @param key - Cache key
   */
  async del(key: string): Promise<void> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache delete');
        return;
      }

      await this.client.del(key);
    } catch (error) {
      // Graceful degradation - log error but don't throw
      logger.error(`Cache delete error for key ${key}:`, error);
    }
  }

  /**
   * Increment a counter in cache
   * @param key - Cache key
   * @param ttl - Time to live in seconds (optional, only set on first increment)
   * @returns New counter value or 0 if error occurs
   */
  async increment(key: string, ttl?: number): Promise<number> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache increment');
        return 0;
      }

      const value = await this.client.incr(key);

      // Set TTL only if this is the first increment (value === 1)
      if (ttl && value === 1) {
        await this.client.expire(key, ttl);
      }

      return value;
    } catch (error) {
      // Graceful degradation - log error but don't throw
      logger.error(`Cache increment error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Check if cache is connected and ready
   */
  isReady(): boolean {
    return this.isConnected;
  }

  /**
   * Ping Redis to check connectivity
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch (error) {
      logger.error('Redis ping error:', error);
      return false;
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    try {
      await this.client.quit();
      logger.info('Redis connection closed gracefully');
    } catch (error) {
      logger.error('Error closing Redis connection:', error);
    }
  }

  /**
   * Get Redis client for advanced operations
   * Use with caution - prefer using the service methods
   */
  getClient(): Redis {
    return this.client;
  }
}

// Export singleton instance
export const cacheService = new CacheService();
export default cacheService;
