import { PrismaClient } from '@prisma/client';
import cacheService from './cache.service';
import logger from '../utils/logger';

const prisma = new PrismaClient();

/**
 * MetadataService provides access to system metadata like roles, experience levels, and cities.
 * All responses are cached in Redis for performance.
 * 
 * Requirements: 5.1 - Provide metadata endpoints for salary benchmarks
 */
class MetadataService {
  private readonly CACHE_TTL = 3600; // 1 hour in seconds
  private readonly ROLES_CACHE_KEY = 'metadata:roles';
  private readonly EXPERIENCE_LEVELS_CACHE_KEY = 'metadata:experience-levels';
  private readonly CITIES_CACHE_KEY = 'metadata:cities';

  /**
   * Get all unique roles from salary benchmarks
   * Results are cached for 1 hour
   */
  async getRoles(): Promise<string[]> {
    try {
      // Try to get from cache first
      const cached = await cacheService.get<string[]>(this.ROLES_CACHE_KEY);
      if (cached) {
        logger.debug('Roles retrieved from cache');
        return cached;
      }

      // Query database for distinct roles
      const roles = await prisma.salaryBenchmark.findMany({
        select: {
          role: true,
        },
        distinct: ['role'],
        orderBy: {
          role: 'asc',
        },
      });

      const roleList = roles.map((r) => r.role);

      // Cache the result
      await cacheService.set(this.ROLES_CACHE_KEY, roleList, this.CACHE_TTL);
      logger.debug(`Roles retrieved from database and cached: ${roleList.length} roles`);

      return roleList;
    } catch (error) {
      logger.error('Error fetching roles:', error);
      throw new Error('Failed to fetch roles');
    }
  }

  /**
   * Get all unique experience levels from salary benchmarks
   * Results are cached for 1 hour
   */
  async getExperienceLevels(): Promise<string[]> {
    try {
      // Try to get from cache first
      const cached = await cacheService.get<string[]>(this.EXPERIENCE_LEVELS_CACHE_KEY);
      if (cached) {
        logger.debug('Experience levels retrieved from cache');
        return cached;
      }

      // Query database for distinct experience levels
      const levels = await prisma.salaryBenchmark.findMany({
        select: {
          experienceLevel: true,
        },
        distinct: ['experienceLevel'],
        orderBy: {
          experienceLevel: 'asc',
        },
      });

      const levelList = levels.map((l) => l.experienceLevel);

      // Cache the result
      await cacheService.set(this.EXPERIENCE_LEVELS_CACHE_KEY, levelList, this.CACHE_TTL);
      logger.debug(`Experience levels retrieved from database and cached: ${levelList.length} levels`);

      return levelList;
    } catch (error) {
      logger.error('Error fetching experience levels:', error);
      throw new Error('Failed to fetch experience levels');
    }
  }

  /**
   * Get all unique cities from salary benchmarks
   * Results are cached for 1 hour
   */
  async getCities(): Promise<string[]> {
    try {
      // Try to get from cache first
      const cached = await cacheService.get<string[]>(this.CITIES_CACHE_KEY);
      if (cached) {
        logger.debug('Cities retrieved from cache');
        return cached;
      }

      // Query database for distinct cities
      const cities = await prisma.salaryBenchmark.findMany({
        select: {
          city: true,
        },
        distinct: ['city'],
        orderBy: {
          city: 'asc',
        },
      });

      const cityList = cities.map((c) => c.city);

      // Cache the result
      await cacheService.set(this.CITIES_CACHE_KEY, cityList, this.CACHE_TTL);
      logger.debug(`Cities retrieved from database and cached: ${cityList.length} cities`);

      return cityList;
    } catch (error) {
      logger.error('Error fetching cities:', error);
      throw new Error('Failed to fetch cities');
    }
  }

  /**
   * Invalidate all metadata caches
   * Should be called when salary benchmarks are updated
   */
  async invalidateCache(): Promise<void> {
    try {
      await Promise.all([
        cacheService.del(this.ROLES_CACHE_KEY),
        cacheService.del(this.EXPERIENCE_LEVELS_CACHE_KEY),
        cacheService.del(this.CITIES_CACHE_KEY),
      ]);
      logger.info('Metadata cache invalidated');
    } catch (error) {
      logger.error('Error invalidating metadata cache:', error);
    }
  }
}

export const metadataService = new MetadataService();
export default metadataService;
