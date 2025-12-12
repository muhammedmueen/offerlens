import logger from '../utils/logger';

/**
 * Metrics Service
 * Tracks API response times and error rates for monitoring
 * Requirements: 8.2
 */

interface MetricData {
  endpoint: string;
  method: string;
  statusCode: number;
  duration: number;
  timestamp: string;
  requestId?: string;
}

/**
 * Track API response time
 * Requirements: 8.2
 */
export const trackResponseTime = (data: MetricData): void => {
  logger.info('API Metrics', {
    metric_type: 'response_time',
    endpoint: data.endpoint,
    method: data.method,
    statusCode: data.statusCode,
    duration: data.duration,
    timestamp: data.timestamp,
    requestId: data.requestId,
  });

  // Log slow requests (> 2 seconds)
  if (data.duration > 2000) {
    logger.warn('Slow API request detected', {
      endpoint: data.endpoint,
      method: data.method,
      duration: data.duration,
      requestId: data.requestId,
    });
  }
};

/**
 * Track error rate by endpoint
 * Requirements: 8.2
 */
export const trackError = (data: Omit<MetricData, 'duration'>): void => {
  logger.error('API Error Metric', {
    metric_type: 'error_rate',
    endpoint: data.endpoint,
    method: data.method,
    statusCode: data.statusCode,
    timestamp: data.timestamp,
    requestId: data.requestId,
  });
};

/**
 * Calculate and log aggregated metrics
 * This can be called periodically or on-demand
 */
export const logAggregatedMetrics = (metrics: {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  slowRequests: number;
}): void => {
  const errorRate = metrics.totalRequests > 0 
    ? ((metrics.failedRequests / metrics.totalRequests) * 100).toFixed(2)
    : '0.00';

  logger.info('Aggregated Metrics', {
    metric_type: 'aggregated',
    totalRequests: metrics.totalRequests,
    successfulRequests: metrics.successfulRequests,
    failedRequests: metrics.failedRequests,
    errorRate: `${errorRate}%`,
    averageResponseTime: `${metrics.averageResponseTime.toFixed(2)}ms`,
    slowRequests: metrics.slowRequests,
    timestamp: new Date().toISOString(),
  });
};

export default {
  trackResponseTime,
  trackError,
  logAggregatedMetrics,
};
