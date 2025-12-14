# Error Handling and Resilience

This document describes the error handling, retry logic, and circuit breaker patterns implemented in the OfferLens backend.

## Overview

The backend implements comprehensive error handling with:
- Standardized error response format
- Global error handler
- Retry logic with exponential backoff for transient failures
- Circuit breaker pattern for external services

## Standardized Error Response Format

All API errors follow a consistent structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: unknown;      // Additional context (optional)
    timestamp: string;      // ISO 8601 timestamp
    requestId: string;      // For tracking and debugging
  };
}
```

### Error Codes

- `VALIDATION_ERROR` - Invalid request data (400)
- `NOT_FOUND` - Resource not found (404)
- `RATE_LIMIT_EXCEEDED` - Too many requests (429)
- `INTERNAL_SERVER_ERROR` - Unexpected server error (500)

## Retry Logic

### Basic Retry with Exponential Backoff

```typescript
import { withRetry } from './utils/retry';

const result = await withRetry(
  async () => {
    // Your operation here
    return await someOperation();
  },
  {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 5000,
    backoffMultiplier: 2,
  }
);
```

### Database Retry

For database operations, use the specialized `withDatabaseRetry`:

```typescript
import { withDatabaseRetry } from './utils/retry';
import { prisma } from './lib/prisma';

const user = await withDatabaseRetry(async () => {
  return await prisma.user.findUnique({ where: { id: userId } });
});
```

### Using with Prisma

The Prisma client wrapper provides automatic retry:

```typescript
import { withPrismaRetry } from './lib/prisma';

const result = await withPrismaRetry(async () => {
  return await prisma.salaryBenchmark.findMany();
});
```

## Circuit Breaker

The circuit breaker prevents cascading failures when external services are down.

### States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit is open, requests fail fast
- **HALF_OPEN**: Testing if service recovered

### Basic Usage

```typescript
import { CircuitBreaker } from './utils/circuitBreaker';

const breaker = new CircuitBreaker({
  name: 'ExternalAPI',
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 60000, // 1 minute
});

const result = await breaker.execute(async () => {
  return await fetch('https://external-api.com/data');
});
```

### External Service Client

For a complete solution with both retry and circuit breaker:

```typescript
import { ExternalServiceClient } from './utils/externalService';

const geminiClient = new ExternalServiceClient({
  name: 'Gemini API',
  circuitBreakerOptions: {
    failureThreshold: 5,
    timeout: 60000,
  },
  retryOptions: {
    maxAttempts: 3,
    initialDelayMs: 1000,
  },
});

const result = await geminiClient.call(async () => {
  const response = await fetch('https://api.gemini.com/...');
  return response.json();
});

// Check circuit status
console.log(geminiClient.getStats());
```

## Global Error Handler

The global error handler catches all unhandled errors and returns standardized responses.

### Custom Application Errors

```typescript
import { AppError } from './middleware/errorHandler';

// Throw custom errors with specific status codes
throw new AppError(404, 'USER_NOT_FOUND', 'User not found', { userId });
```

### Error Logging

All errors are automatically logged with context:
- Error message and stack trace
- Request ID
- Request path and method
- Timestamp

## Best Practices

1. **Use retry for transient failures**: Database connections, network issues
2. **Use circuit breaker for external services**: APIs, third-party services
3. **Combine both for critical operations**: Maximum resilience
4. **Log all errors**: Use the logger for debugging
5. **Never expose sensitive data**: Error responses are sanitized

## Requirements Validation

- ✅ 10.1: Global error handler catches all unhandled errors
- ✅ 10.2: Structured error responses with codes and messages
- ✅ 10.4: Retry logic with exponential backoff and circuit breaker
