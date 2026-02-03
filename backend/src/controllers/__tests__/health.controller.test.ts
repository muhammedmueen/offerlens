import { Request, Response } from 'express';
import { livenessProbe, readinessProbe } from '../health.controller';
import prisma from '../../lib/prisma';
import { cacheService } from '../../services';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { it } from 'node:test';
import { describe } from 'node:test';
import { beforeEach } from 'node:test';
import { describe } from 'node:test';

/**
 * Health Controller Tests
 * Tests for liveness and readiness probes
 * Requirements: 8.3
 */

// Mock dependencies
jest.mock('../../lib/prisma', () => ({
  $queryRaw: jest.fn(),
}));

jest.mock('../../services', () => ({
  cacheService: {
    set: jest.fn(),
    get: jest.fn(),
    del: jest.fn(),
  },
}));

describe('Health Controller', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    jsonMock = jest.fn();
    statusMock = jest.fn().mockReturnValue({ json: jsonMock });
    
    mockRequest = {};
    mockResponse = {
      status: statusMock,
      json: jsonMock,
    };

    jest.clearAllMocks();
  });

  describe('livenessProbe', () => {
    it('should return 200 with status ok', () => {
      livenessProbe(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        status: 'ok',
        timestamp: expect.any(String),
        uptime: expect.any(Number),
      }));
    });
  });

  describe('readinessProbe', () => {
    it('should return 200 when all checks pass', async () => {
      // Mock successful database check
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      
      // Mock successful Redis check - need to return the same value that was set
      let storedValue: string;
      (cacheService.set as jest.Mock).mockImplementation(async (_key: string, value: string) => {
        storedValue = value;
      });
      (cacheService.get as jest.Mock).mockImplementation(async () => storedValue);
      (cacheService.del as jest.Mock).mockResolvedValue(undefined);

      await readinessProbe(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(200);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        status: 'ready',
        checks: expect.objectContaining({
          database: { status: 'ok' },
          redis: { status: 'ok' },
        }),
      }));
    });

    it('should return 503 when database check fails', async () => {
      // Mock failed database check
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      // Mock successful Redis check - need to return the same value that was set
      let storedValue: string;
      (cacheService.set as jest.Mock).mockImplementation(async (_key: string, value: string) => {
        storedValue = value;
      });
      (cacheService.get as jest.Mock).mockImplementation(async () => storedValue);
      (cacheService.del as jest.Mock).mockResolvedValue(undefined);

      await readinessProbe(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        status: 'not_ready',
        checks: expect.objectContaining({
          database: expect.objectContaining({
            status: 'error',
            message: expect.any(String),
          }),
          redis: { status: 'ok' },
        }),
      }));
    });

    it('should return 503 when Redis check fails', async () => {
      // Mock successful database check
      (prisma.$queryRaw as jest.Mock).mockResolvedValue([{ result: 1 }]);
      
      // Mock failed Redis check
      (cacheService.set as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await readinessProbe(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        status: 'not_ready',
        checks: expect.objectContaining({
          database: { status: 'ok' },
          redis: expect.objectContaining({
            status: 'error',
            message: expect.any(String),
          }),
        }),
      }));
    });

    it('should return 503 when both checks fail', async () => {
      // Mock failed database check
      (prisma.$queryRaw as jest.Mock).mockRejectedValue(new Error('Database connection failed'));
      
      // Mock failed Redis check
      (cacheService.set as jest.Mock).mockRejectedValue(new Error('Redis connection failed'));

      await readinessProbe(mockRequest as Request, mockResponse as Response);

      expect(statusMock).toHaveBeenCalledWith(503);
      expect(jsonMock).toHaveBeenCalledWith(expect.objectContaining({
        status: 'not_ready',
        checks: expect.objectContaining({
          database: expect.objectContaining({ status: 'error' }),
          redis: expect.objectContaining({ status: 'error' }),
        }),
      }));
    });
  });
});
