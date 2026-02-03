import { trackResponseTime, trackError, logAggregatedMetrics } from '../metrics.service';
import logger from '../../utils/logger';

/**
 * Metrics Service Tests
 * Tests for API response time and error rate tracking
 * Requirements: 8.2
 */

// Mock the logger
jest.mock('../../utils/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
}));

describe('Metrics Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('trackResponseTime', () => {
    it('should log response time metrics', () => {
      const metricData = {
        endpoint: 'POST /api/v1/analyze',
        method: 'POST',
        statusCode: 200,
        duration: 1500,
        timestamp: new Date().toISOString(),
        requestId: 'test-request-id',
      };

      trackResponseTime(metricData);

      expect(logger.info).toHaveBeenCalledWith('API Metrics', expect.objectContaining({
        metric_type: 'response_time',
        endpoint: metricData.endpoint,
        method: metricData.method,
        statusCode: metricData.statusCode,
        duration: metricData.duration,
      }));
    });

    it('should warn about slow requests (> 2 seconds)', () => {
      const metricData = {
        endpoint: 'POST /api/v1/analyze',
        method: 'POST',
        statusCode: 200,
        duration: 3000,
        timestamp: new Date().toISOString(),
        requestId: 'test-request-id',
      };

      trackResponseTime(metricData);

      expect(logger.warn).toHaveBeenCalledWith('Slow API request detected', expect.objectContaining({
        endpoint: metricData.endpoint,
        duration: metricData.duration,
      }));
    });

    it('should not warn about fast requests', () => {
      const metricData = {
        endpoint: 'GET /api/v1/health',
        method: 'GET',
        statusCode: 200,
        duration: 50,
        timestamp: new Date().toISOString(),
      };

      trackResponseTime(metricData);

      expect(logger.warn).not.toHaveBeenCalled();
    });
  });

  describe('trackError', () => {
    it('should log error metrics', () => {
      const metricData = {
        endpoint: 'POST /api/v1/analyze',
        method: 'POST',
        statusCode: 500,
        timestamp: new Date().toISOString(),
        requestId: 'test-request-id',
      };

      trackError(metricData);

      expect(logger.error).toHaveBeenCalledWith('API Error Metric', expect.objectContaining({
        metric_type: 'error_rate',
        endpoint: metricData.endpoint,
        statusCode: metricData.statusCode,
      }));
    });
  });

  describe('logAggregatedMetrics', () => {
    it('should log aggregated metrics with error rate', () => {
      const metrics = {
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        averageResponseTime: 1234.56,
        slowRequests: 3,
      };

      logAggregatedMetrics(metrics);

      expect(logger.info).toHaveBeenCalledWith('Aggregated Metrics', expect.objectContaining({
        metric_type: 'aggregated',
        totalRequests: 100,
        successfulRequests: 95,
        failedRequests: 5,
        errorRate: '5.00%',
        averageResponseTime: '1234.56ms',
        slowRequests: 3,
      }));
    });

    it('should handle zero requests', () => {
      const metrics = {
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        averageResponseTime: 0,
        slowRequests: 0,
      };

      logAggregatedMetrics(metrics);

      expect(logger.info).toHaveBeenCalledWith('Aggregated Metrics', expect.objectContaining({
        errorRate: '0.00%',
      }));
    });
  });
});
