import request from 'supertest';
import { createApp } from '../../app';
import { prisma } from '../../lib/prisma';
import cacheService from '../../services/cache.service';

const app = createApp();

describe('Metadata Controller', () => {
  beforeAll(async () => {
    // Ensure we have test data
    await prisma.salaryBenchmark.deleteMany();
    
    // Create test salary benchmarks with various roles, experience levels, and cities
    await prisma.salaryBenchmark.createMany({
      data: [
        {
          role: 'Software Engineer',
          experienceLevel: '0-1 years',
          city: 'Bangalore',
          minSalary: 3.5,
          avgSalary: 5.5,
          maxSalary: 8,
          effectiveDate: new Date(),
        },
        {
          role: 'Software Engineer',
          experienceLevel: '1-3 years',
          city: 'Mumbai',
          minSalary: 5,
          avgSalary: 8,
          maxSalary: 12,
          effectiveDate: new Date(),
        },
        {
          role: 'Data Scientist',
          experienceLevel: '3-5 years',
          city: 'Delhi NCR',
          minSalary: 14,
          avgSalary: 20,
          maxSalary: 30,
          effectiveDate: new Date(),
        },
        {
          role: 'Product Manager',
          experienceLevel: '5-8 years',
          city: 'Hyderabad',
          minSalary: 22,
          avgSalary: 32,
          maxSalary: 45,
          effectiveDate: new Date(),
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.salaryBenchmark.deleteMany();
    await prisma.$disconnect();
  });

  beforeEach(async () => {
    // Clear cache before each test
    await cacheService.del('metadata:roles');
    await cacheService.del('metadata:experience-levels');
    await cacheService.del('metadata:cities');
  });

  describe('GET /api/v1/roles', () => {
    it('should return all unique roles', async () => {
      const response = await request(app).get('/api/v1/roles').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toContain('Software Engineer');
      expect(response.body.data).toContain('Data Scientist');
      expect(response.body.data).toContain('Product Manager');
      expect(response.body.count).toBe(3);
    });

    it('should return cached data on second request', async () => {
      // First request - should hit database
      const response1 = await request(app).get('/api/v1/roles').expect(200);

      // Second request - should hit cache
      const response2 = await request(app).get('/api/v1/roles').expect(200);

      expect(response1.body).toEqual(response2.body);
    });

    it('should return JSON response', async () => {
      const response = await request(app).get('/api/v1/roles').expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /api/v1/experience-levels', () => {
    it('should return all unique experience levels', async () => {
      const response = await request(app).get('/api/v1/experience-levels').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toContain('0-1 years');
      expect(response.body.data).toContain('1-3 years');
      expect(response.body.data).toContain('3-5 years');
      expect(response.body.data).toContain('5-8 years');
      expect(response.body.count).toBe(4);
    });

    it('should return cached data on second request', async () => {
      // First request - should hit database
      const response1 = await request(app).get('/api/v1/experience-levels').expect(200);

      // Second request - should hit cache
      const response2 = await request(app).get('/api/v1/experience-levels').expect(200);

      expect(response1.body).toEqual(response2.body);
    });

    it('should return JSON response', async () => {
      const response = await request(app).get('/api/v1/experience-levels').expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('GET /api/v1/cities', () => {
    it('should return all unique cities', async () => {
      const response = await request(app).get('/api/v1/cities').expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      expect(response.body).toHaveProperty('count');
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data).toContain('Bangalore');
      expect(response.body.data).toContain('Mumbai');
      expect(response.body.data).toContain('Delhi NCR');
      expect(response.body.data).toContain('Hyderabad');
      expect(response.body.count).toBe(4);
    });

    it('should return cached data on second request', async () => {
      // First request - should hit database
      const response1 = await request(app).get('/api/v1/cities').expect(200);

      // Second request - should hit cache
      const response2 = await request(app).get('/api/v1/cities').expect(200);

      expect(response1.body).toEqual(response2.body);
    });

    it('should return JSON response', async () => {
      const response = await request(app).get('/api/v1/cities').expect(200);

      expect(response.headers['content-type']).toMatch(/json/);
    });
  });

  describe('Cache invalidation', () => {
    it('should return fresh data after cache invalidation', async () => {
      // First request - populate cache
      const response1 = await request(app).get('/api/v1/roles').expect(200);
      const initialCount = response1.body.count;

      // Add a new role
      await prisma.salaryBenchmark.create({
        data: {
          role: 'DevOps Engineer',
          experienceLevel: '1-3 years',
          city: 'Pune',
          minSalary: 6,
          avgSalary: 10,
          maxSalary: 14,
          effectiveDate: new Date(),
        },
      });

      // Clear cache
      await cacheService.del('metadata:roles');

      // Second request - should get fresh data
      const response2 = await request(app).get('/api/v1/roles').expect(200);

      expect(response2.body.count).toBe(initialCount + 1);
      expect(response2.body.data).toContain('DevOps Engineer');
    });
  });
});
