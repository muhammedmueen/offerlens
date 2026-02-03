import { PrismaClient } from '@prisma/client';
import { analysisService } from '../analysis.service';

// Mock Prisma
jest.mock('@prisma/client', () => {
  const mockPrismaClient = {
    salaryBenchmark: {
      findFirst: jest.fn(),
    },
  };
  return {
    PrismaClient: jest.fn(() => mockPrismaClient),
  };
});

// Mock cache service
jest.mock('../cache.service', () => ({
  cacheService: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
}));

describe('AnalysisService - Salary Comparison', () => {
  let prisma: any;

  beforeEach(() => {
    prisma = new PrismaClient();
    jest.clearAllMocks();
  });

  describe('compareSalary', () => {
    it('should return "below" when CTC is significantly below average', async () => {
      // Mock salary benchmark data
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '1',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Bangalore',
        minSalary: 5,
        avgSalary: 8,
        maxSalary: 12,
        effectiveDate: new Date(),
      });

      const result = await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        6, // Below average (8 - 10% threshold = 7.2)
        'Bangalore'
      );

      expect(result.comparison).toBe('below');
      expect(result.range).toEqual({ min: 5, avg: 8, max: 12 });
      expect(result.difference).toBe(-2);
      expect(result.message).toContain('below market average');
    });

    it('should return "aligned" when CTC is within 10% of average', async () => {
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '1',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Bangalore',
        minSalary: 5,
        avgSalary: 8,
        maxSalary: 12,
        effectiveDate: new Date(),
      });

      const result = await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        8.5, // Within 10% threshold (8 ± 0.8)
        'Bangalore'
      );

      expect(result.comparison).toBe('aligned');
      expect(result.range).toEqual({ min: 5, avg: 8, max: 12 });
      expect(result.difference).toBe(0.5);
      expect(result.message).toContain('aligned with market standards');
    });

    it('should return "above" when CTC is significantly above average', async () => {
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '1',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Bangalore',
        minSalary: 5,
        avgSalary: 8,
        maxSalary: 12,
        effectiveDate: new Date(),
      });

      const result = await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        10, // Above average (8 + 10% threshold = 8.8)
        'Bangalore'
      );

      expect(result.comparison).toBe('above');
      expect(result.range).toEqual({ min: 5, avg: 8, max: 12 });
      expect(result.difference).toBe(2);
      expect(result.message).toContain('exceeds market average');
    });

    it('should apply city-specific salary data from database', async () => {
      // Mock city-specific data (multiplier already applied in seed)
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '2',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Pune',
        minSalary: 4.25, // 5 * 0.85 (Pune multiplier)
        avgSalary: 6.8, // 8 * 0.85
        maxSalary: 10.2, // 12 * 0.85
        effectiveDate: new Date(),
      });

      const result = await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        7,
        'Pune'
      );

      expect(result.range).toEqual({ min: 4.25, avg: 6.8, max: 10.2 });
      expect(result.comparison).toBe('aligned');
    });

    it('should query most recent benchmark by effectiveDate', async () => {
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '1',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Bangalore',
        minSalary: 5,
        avgSalary: 8,
        maxSalary: 12,
        effectiveDate: new Date('2024-01-01'),
      });

      await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        8,
        'Bangalore'
      );

      expect(prisma.salaryBenchmark.findFirst).toHaveBeenCalledWith({
        where: {
          role: 'Software Engineer',
          experienceLevel: '1-3 years',
          city: 'Bangalore',
        },
        orderBy: {
          effectiveDate: 'desc',
        },
      });
    });

    it('should handle missing benchmark data gracefully', async () => {
      prisma.salaryBenchmark.findFirst.mockResolvedValue(null);

      const result = await analysisService.compareSalary(
        'Unknown Role',
        '1-3 years',
        8,
        'Unknown City'
      );

      expect(result.comparison).toBe('aligned');
      expect(result.range).toEqual({ min: 0, avg: 0, max: 0 });
      expect(result.message).toContain('No market data available');
    });

    it('should calculate difference correctly', async () => {
      prisma.salaryBenchmark.findFirst.mockResolvedValue({
        id: '1',
        role: 'Software Engineer',
        experienceLevel: '1-3 years',
        city: 'Bangalore',
        minSalary: 5,
        avgSalary: 10,
        maxSalary: 15,
        effectiveDate: new Date(),
      });

      const result = await analysisService.compareSalary(
        'Software Engineer',
        '1-3 years',
        12,
        'Bangalore'
      );

      expect(result.difference).toBe(2); // 12 - 10
    });
  });
});
