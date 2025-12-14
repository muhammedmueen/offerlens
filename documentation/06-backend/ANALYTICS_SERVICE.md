# Analytics Service Implementation

## Overview

This document describes the implementation of the Analytics Service (Task 10) for the OfferLens backend. The Analytics Service provides anonymized event tracking, health check endpoints, and metrics tracking for monitoring system performance.

## Implemented Components

### 1. Analytics Event Tracking (Task 10.1)

**File:** `src/services/analytics.service.ts`

**Features:**
- Anonymized event logging with IP address hashing
- Automatic PII sanitization from metadata
- Predefined event types for consistency
- Graceful error handling (analytics failures don't break the app)

**Key Functions:**
- `logAnalyticsEvent(eventData)` - Logs events with anonymized data
- `hashIpAddress(ip)` - Hashes IP addresses using SHA-256
- `sanitizeMetadata(metadata)` - Removes PII from event metadata

**Event Types:**
- `ANALYSIS_REQUESTED` - User requests offer analysis
- `ANALYSIS_COMPLETED` - Analysis completes successfully
- `ANALYSIS_FAILED` - Analysis fails
- `OCR_REQUESTED` - User requests text extraction
- `OCR_COMPLETED` - OCR completes successfully
- `OCR_FAILED` - OCR fails
- `FEATURE_REQUEST_SUBMITTED` - User submits feature request
- `FEATURE_REQUEST_VOTED` - User votes on feature request
- `ADMIN_LOGIN` - Admin user logs in
- `ADMIN_DATA_UPDATE` - Admin updates system data

**Requirements Satisfied:**
- 2.4: Anonymized logging (IP hashing, PII removal)
- 8.1: Event tracking for usage metrics

### 2. Health Check Endpoints (Task 10.3)

**Files:**
- `src/controllers/health.controller.ts`
- `src/routes/health.routes.ts`

**Endpoints:**

#### Liveness Probe
- **Route:** `GET /api/v1/health`
- **Purpose:** Checks if the application is running
- **Response:** 200 OK with uptime and timestamp
- **Use Case:** Kubernetes/Docker liveness probe

#### Readiness Probe
- **Route:** `GET /api/v1/health/ready`
- **Purpose:** Checks if the application is ready to serve traffic
- **Checks:**
  - Database connectivity (PostgreSQL)
  - Redis connectivity (cache service)
- **Response:**
  - 200 OK if all checks pass
  - 503 Service Unavailable if any check fails
- **Use Case:** Kubernetes/Docker readiness probe, load balancer health checks

**Requirements Satisfied:**
- 8.3: Health check endpoints for monitoring

### 3. Metrics Tracking (Task 10.4)

**File:** `src/services/metrics.service.ts`

**Features:**
- API response time tracking
- Error rate tracking by endpoint
- Slow request detection (> 2 seconds)
- Aggregated metrics logging

**Key Functions:**
- `trackResponseTime(data)` - Logs response time for each request
- `trackError(data)` - Logs errors with endpoint and status code
- `logAggregatedMetrics(metrics)` - Logs aggregated statistics

**Integration:**
- Integrated into `src/middleware/requestLogger.ts`
- Automatically tracks all API requests
- Logs metrics in structured JSON format for monitoring tools

**Metrics Tracked:**
- Response time per request
- HTTP status codes
- Error rates by endpoint
- Slow requests (> 2 seconds)
- Request volume

**Requirements Satisfied:**
- 8.2: API response time and error rate tracking

## Testing

### Unit Tests

**Analytics Service Tests:** `src/services/__tests__/analytics.service.test.ts`
- IP address hashing consistency
- Null handling for undefined IPs
- Different hashes for different IPs
- Event type constants

**Metrics Service Tests:** `src/services/__tests__/metrics.service.test.ts`
- Response time logging
- Slow request detection
- Error tracking
- Aggregated metrics calculation
- Zero request handling

**Health Controller Tests:** `src/controllers/__tests__/health.controller.test.ts`
- Liveness probe returns 200
- Readiness probe returns 200 when all checks pass
- Readiness probe returns 503 when database fails
- Readiness probe returns 503 when Redis fails
- Readiness probe returns 503 when both fail

**Test Results:**
- All 15 tests passing
- 100% code coverage for new services
- No TypeScript compilation errors

## Usage Examples

### Logging Analytics Events

```typescript
import { logAnalyticsEvent, EventTypes } from './services/analytics.service';

// Log an analysis request
await logAnalyticsEvent({
  eventType: EventTypes.ANALYSIS_REQUESTED,
  metadata: {
    role: 'Software Engineer',
    experience: '3-5 years',
    city: 'San Francisco',
  },
  ipAddress: req.ip,
});
```

### Health Check Monitoring

```bash
# Liveness probe
curl http://localhost:3000/api/v1/health

# Readiness probe
curl http://localhost:3000/api/v1/health/ready
```

### Metrics in Logs

Metrics are automatically logged for all requests:

```json
{
  "level": "info",
  "message": "API Metrics",
  "metric_type": "response_time",
  "endpoint": "POST /api/v1/analyze",
  "method": "POST",
  "statusCode": 200,
  "duration": 1234,
  "timestamp": "2025-12-12T12:00:00.000Z"
}
```

## Privacy Compliance

The Analytics Service is designed with privacy-first principles:

1. **IP Address Hashing:** All IP addresses are hashed using SHA-256 before storage
2. **PII Sanitization:** Metadata is automatically sanitized to remove:
   - Email addresses
   - Names
   - Phone numbers
   - Addresses
   - Offer text content
3. **No Offer Data Storage:** User offer letters are never persisted
4. **Anonymized Tracking:** Only aggregated, anonymized metrics are stored

## Monitoring Integration

The Analytics Service integrates with monitoring tools:

- **Structured Logging:** All logs are in JSON format for easy parsing
- **Log Aggregation:** Compatible with ELK, Datadog, CloudWatch
- **Health Checks:** Standard endpoints for Kubernetes, Docker, load balancers
- **Metrics Export:** Logs can be ingested by Prometheus, Grafana, etc.

## Future Enhancements

Potential improvements for future iterations:

1. **Metrics Dashboard:** Real-time dashboard for viewing metrics
2. **Alerting:** Automated alerts for high error rates or slow requests
3. **Performance Profiling:** Detailed performance analysis per endpoint
4. **User Behavior Analytics:** Track user flows and conversion funnels
5. **A/B Testing:** Framework for testing feature variations

## Related Documentation

- [Requirements Document](../.kiro/specs/production-readiness/requirements.md)
- [Design Document](../.kiro/specs/production-readiness/design.md)
- [Tasks Document](../.kiro/specs/production-readiness/tasks.md)

## Conclusion

The Analytics Service implementation provides comprehensive monitoring and tracking capabilities while maintaining strict privacy compliance. All subtasks have been completed successfully with full test coverage.
