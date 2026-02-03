import { Request, Response } from 'express';
import { z } from 'zod';
import { adminService } from '../services/admin.service';
import { prisma } from '../lib/prisma';
import { cacheService } from '../services/cache.service';
import metadataService from '../services/metadata.service';
import logger from '../utils/logger';

// Validation schemas
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const salaryBenchmarkSchema = z.object({
  role: z.string().min(1),
  experienceLevel: z.string().min(1),
  city: z.string().min(1),
  minSalary: z.number().positive(),
  avgSalary: z.number().positive(),
  maxSalary: z.number().positive(),
  effectiveDate: z.string().optional(),
});

const redFlagRuleSchema = z.object({
  ruleId: z.string().min(1),
  severity: z.enum(['high', 'medium', 'low']),
  title: z.string().min(1),
  description: z.string().min(1),
  keywords: z.array(z.string()),
  active: z.boolean().optional(),
});

const featureRequestStatusSchema = z.object({
  status: z.enum(['submitted', 'under_review', 'planned', 'in_progress', 'completed', 'declined']),
  adminNote: z.string().optional(),
});

export class AdminController {
  /**
   * POST /api/v1/admin/login
   * Authenticate admin and return JWT token
   * Requirements: 5.2
   */
  async login(req: Request, res: Response): Promise<void> {
    try {
      const { username, password } = loginSchema.parse(req.body);

      const token = await adminService.authenticate(username, password);

      res.status(200).json({
        token,
        expiresIn: '7d',
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Admin login error', { error });
      res.status(401).json({
        error: {
          code: 'AUTHENTICATION_FAILED',
          message: 'Invalid credentials',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * POST /api/v1/admin/salary-benchmarks
   * Create a new salary benchmark
   * Requirements: 5.2, 5.3
   */
  async createSalaryBenchmark(req: Request, res: Response): Promise<void> {
    try {
      const data = salaryBenchmarkSchema.parse(req.body);

      const benchmark = await prisma.salaryBenchmark.create({
        data: {
          role: data.role,
          experienceLevel: data.experienceLevel,
          city: data.city,
          minSalary: data.minSalary,
          avgSalary: data.avgSalary,
          maxSalary: data.maxSalary,
          effectiveDate: data.effectiveDate ? new Date(data.effectiveDate) : new Date(),
        },
      });

      // Invalidate cache
      await cacheService.del('salary_benchmarks:*');
      await metadataService.invalidateCache();
      logger.info('Salary benchmark and metadata cache invalidated');

      res.status(201).json(benchmark);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Create salary benchmark error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create salary benchmark',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * PUT /api/v1/admin/salary-benchmarks/:id
   * Update an existing salary benchmark
   * Requirements: 5.2, 5.3
   */
  async updateSalaryBenchmark(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = salaryBenchmarkSchema.partial().parse(req.body);

      const benchmark = await prisma.salaryBenchmark.update({
        where: { id },
        data: {
          ...(data.role && { role: data.role }),
          ...(data.experienceLevel && { experienceLevel: data.experienceLevel }),
          ...(data.city && { city: data.city }),
          ...(data.minSalary && { minSalary: data.minSalary }),
          ...(data.avgSalary && { avgSalary: data.avgSalary }),
          ...(data.maxSalary && { maxSalary: data.maxSalary }),
          ...(data.effectiveDate && { effectiveDate: new Date(data.effectiveDate) }),
        },
      });

      // Invalidate cache
      await cacheService.del('salary_benchmarks:*');
      await metadataService.invalidateCache();
      logger.info('Salary benchmark and metadata cache invalidated');

      res.status(200).json(benchmark);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Update salary benchmark error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update salary benchmark',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * POST /api/v1/admin/red-flag-rules
   * Create a new red flag rule
   * Requirements: 4.5
   */
  async createRedFlagRule(req: Request, res: Response): Promise<void> {
    try {
      const data = redFlagRuleSchema.parse(req.body);

      const rule = await prisma.redFlagRule.create({
        data: {
          ruleId: data.ruleId,
          severity: data.severity,
          title: data.title,
          description: data.description,
          keywords: data.keywords,
          active: data.active ?? true,
        },
      });

      // Invalidate cache
      await cacheService.del('red_flag_rules');
      logger.info('Red flag rules cache invalidated');

      res.status(201).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Create red flag rule error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to create red flag rule',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * PUT /api/v1/admin/red-flag-rules/:id
   * Update an existing red flag rule
   * Requirements: 4.5
   */
  async updateRedFlagRule(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = redFlagRuleSchema.partial().parse(req.body);

      const rule = await prisma.redFlagRule.update({
        where: { id },
        data: {
          ...(data.ruleId && { ruleId: data.ruleId }),
          ...(data.severity && { severity: data.severity }),
          ...(data.title && { title: data.title }),
          ...(data.description && { description: data.description }),
          ...(data.keywords && { keywords: data.keywords }),
          ...(data.active !== undefined && { active: data.active }),
        },
      });

      // Invalidate cache
      await cacheService.del('red_flag_rules');
      logger.info('Red flag rules cache invalidated');

      res.status(200).json(rule);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Update red flag rule error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update red flag rule',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * POST /api/v1/admin/salary-benchmarks/import
   * Bulk import salary benchmarks from CSV or JSON
   * Requirements: 5.5
   */
  async importSalaryBenchmarks(req: Request, res: Response): Promise<void> {
    try {
      const { data } = req.body;

      if (!data || !Array.isArray(data)) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Data must be an array',
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      // Validate each item
      const validatedData = data.map((item) => salaryBenchmarkSchema.parse(item));

      // Bulk create
      const results = await prisma.$transaction(
        validatedData.map((item) =>
          prisma.salaryBenchmark.create({
            data: {
              role: item.role,
              experienceLevel: item.experienceLevel,
              city: item.city,
              minSalary: item.minSalary,
              avgSalary: item.avgSalary,
              maxSalary: item.maxSalary,
              effectiveDate: item.effectiveDate ? new Date(item.effectiveDate) : new Date(),
            },
          })
        )
      );

      // Invalidate cache
      await cacheService.del('salary_benchmarks:*');
      await metadataService.invalidateCache();
      logger.info('Salary benchmark and metadata cache invalidated after bulk import');

      res.status(201).json({
        imported: results.length,
        message: `Successfully imported ${results.length} salary benchmarks`,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid data format',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Import salary benchmarks error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to import salary benchmarks',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }

  /**
   * PUT /api/v1/admin/feature-requests/:id/status
   * Update feature request status
   * Requirements: 14.4, 14.5
   */
  async updateFeatureRequestStatus(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const data = featureRequestStatusSchema.parse(req.body);

      const featureRequest = await prisma.featureRequest.update({
        where: { id },
        data: {
          status: data.status,
          ...(data.adminNote && { adminNote: data.adminNote }),
        },
      });

      logger.info(`Feature request ${id} status updated to ${data.status}`);

      res.status(200).json(featureRequest);
    } catch (error) {
      if (error instanceof z.ZodError) {
        res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
            timestamp: new Date().toISOString(),
            requestId: req.headers['x-request-id'] || 'unknown',
          },
        });
        return;
      }

      logger.error('Update feature request status error', { error });
      res.status(500).json({
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Failed to update feature request status',
          timestamp: new Date().toISOString(),
          requestId: req.headers['x-request-id'] || 'unknown',
        },
      });
    }
  }
}

export const adminController = new AdminController();
