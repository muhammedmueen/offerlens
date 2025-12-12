# Retry Logic and Circuit Breaker Implementation

This document describes the retry logic and circuit breaker patterns implemented in the OfferLens backend to handle transient failures and protect against cascading failures.

## Overview

The system implements two key resilience patterns:

1. **Retry Logic with Exponential Backoff** - Automatically retries failed operations with increasing delays
2. **Circuit Breaker Pattern** - Prevents cascading failures by failing fast when a service is unavailable

## Requirements

- **Requirement 10.4**: Implement retry logic with exponential backoff for transient failures
- **Requirement 10.4**: Add circuit breaker for external services

## Implementation

### 1. Retry Logic (`src/utils/retry.ts`)

The retry utility provides exponential backoff for transient failures.

#### Features

- Configurable max attempts
- Exponential backoff with configurable multiplier
- Maximum delay cap
- Selective retry based on error types
- Specialized database retry function

#### Usage

```typescript
import { withRetry, withDatabaseRetry } from '../utils/retry';

// Basic retry
const result = await withRetry(async () => {
  return await someOperation();
});

// Custom retry options
const result = await withRetry(
  async () => {
    return await someOperation();
  },
  {
    maxAttempts: 5,
    initialDelayMs: 200,
    maxDelayMs: 10000,
    backoffMultiplier: 2,
  }
);

// Retry only specific error types
class NetworkError extends Error {}
class TimeoutError extends Error {}

const result = await withRetry(
  async () => {
    return await someOperation();
  },
  {
    retryableErrors: [NetworkError, TimeoutError],
  }
);

// Database-specific retry (retries all errors)
const result = await withDatabaseRetry(async () => {
  return await prisma.user.findMany();
});
```

#### Configuration Options

```typescript
interface RetryOptions {
  maxAttempts?: number; // Default: 3
  initialDelayMs?: number; // Default: 100
  maxDelayMs?: number; // Default: 5000
  backoffMultiplier?: number; // Default: 2
  retryableErrors?: Array<new (...args: any[]) => Error>; // Default: [] (retry all)
}
```

### 2. Circuit Breaker (`src/utils/circuitBreaker.ts`)

The circuit breaker prevents cascading failures by failing fast when a service is unavailable.

#### States

- **CLOSED**: Normal operation, requests pass through
- **OPEN**: Circuit is open, requests fail immediately
- **HALF_OPEN**: Testing if service recovered, limited requests pass through

#### Features

- Configurable failure threshold
- Configurable success threshold for recovery
- Automatic state transitions
- Statistics tracking
- Manual reset capability

#### Usage

```typescript
import { CircuitBreaker, createCircuitBreaker } from '../utils/circuitBreaker';

// Create a circuit breaker
const breaker = createCircuitBreaker({
  name: 'ExternalAPI',
  failureThreshold: 5, // Open after 5 failures
  successThreshold: 2, // Close after 2 successes in HALF_OPEN
  timeout: 60000, // Wait 60s before trying again
});

// Execute with circuit breaker protection
try {
  const result = await breaker.execute(async () => {
    return await externalApiCall();
  });
} catch (error) {
  // Handle error (could be from API or circuit breaker)
  console.error('Operation failed:', error);
}

// Check circuit state
console.log('Circuit state:', breaker.getState());

// Get statistics
const stats = breaker.getStats();
console.log('Stats:', stats);

// Manually reset if needed
breaker.reset();
```

#### Configuration Options

```typescript
interface CircuitBreakerOptions {
  name?: string; // For logging
  failureThreshold?: number; // Default: 5
  successThreshold?: number; // Default: 2
  timeout?: number; // Default: 60000 (1 minute)
}
```

### 3. External Service Client (`src/utils/externalService.ts`)

Combines retry logic and circuit breaker for external service calls.

#### Usage

```typescript
import { ExternalServiceClient } from '../utils/externalService';

// Create a client for an external service
const geminiClient = new ExternalServiceClient({
  name: 'Gemini API',
  circuitBreakerOptions: {
    failureThreshold: 5,
    successThreshold: 2,
    timeout: 60000,
  },
  retryOptions: {
    maxAttempts: 3,
    initialDelayMs: 1000,
    maxDelayMs: 5000,
  },
});

// Make calls through the client
try {
  const result = await geminiClient.call(async () => {
    const response = await fetch('https://api.gemini.com/...');
    return response.json();
  });
} catch (error) {
  console.error('API call failed:', error);
}

// Monitor circuit breaker
const stats = geminiClient.getStats();
console.log('Circuit breaker stats:', stats);
```

## Integration Examples

### Database Operations

Database operations automatically use retry logic through the Prisma client wrapper:

```typescript
// src/lib/prisma.ts
import { withDatabaseRetry } from '../utils/retry';

export async function withPrismaRetry<T>(fn: () => Promise<T>): Promise<T> {
  return withDatabaseRetry(fn, {
    maxAttempts: 3,
    initialDelayMs: 100,
    maxDelayMs: 2000,
  });
}

// Usage in services
const users = await withPrismaRetry(() => prisma.user.findMany());
```

### External API Calls

For services that make external API calls (e.g., OCR, email, AI services):

```typescript
// Create a client instance
const ocrClient = new ExternalServiceClient({
  name: 'Tesseract OCR',
  circuitBreakerOptions: {
    failureThreshold: 3,
    timeout: 30000,
  },
  retryOptions: {
    maxAttempts: 2,
    initialDelayMs: 500,
  },
});

// Use in service methods
async extractText(buffer: Buffer): Promise<string> {
  return ocrClient.call(async () => {
    const Tesseract = await import('tesseract.js');
    const worker = await Tesseract.createWorker('eng');
    const { data } = await worker.recognize(buffer);
    await worker.terminate();
    return data.text;
  });
}
```

## Testing

Comprehensive tests are provided for both utilities:

```bash
# Run retry tests
npm test -- src/utils/__tests__/retry.test.ts

# Run circuit breaker tests
npm test -- src/utils/__tests__/circuitBreaker.test.ts

# Run all utility tests
npm test -- src/utils/__tests__/
```

### Test Coverage

**Retry Logic Tests:**
- ✓ Success on first attempt
- ✓ Retry on failure and eventually succeed
- ✓ Throw error after max attempts
- ✓ Respect exponential backoff
- ✓ Not retry non-retryable errors
- ✓ Cap delay at maxDelayMs
- ✓ Database retry operations

**Circuit Breaker Tests:**
- ✓ Allow requests when circuit is closed
- ✓ Open circuit after failure threshold
- ✓ Reject requests immediately when circuit is open
- ✓ Transition to HALF_OPEN after timeout
- ✓ Close circuit after success threshold
- ✓ Reopen circuit on failure in HALF_OPEN state
- ✓ Return circuit statistics
- ✓ Manual reset functionality

## Best Practices

### When to Use Retry Logic

✅ **Use for:**
- Database connection errors
- Network timeouts
- Temporary service unavailability
- Rate limit errors (with appropriate backoff)

❌ **Don't use for:**
- Validation errors (400)
- Authentication errors (401)
- Authorization errors (403)
- Not found errors (404)
- Business logic errors

### When to Use Circuit Breaker

✅ **Use for:**
- External API calls
- Third-party services
- Microservice communication
- Any service that can fail independently

❌ **Don't use for:**
- Database operations (use retry instead)
- Internal function calls
- Synchronous operations

### Combining Both

For external services, combine both patterns:

```typescript
const client = new ExternalServiceClient({
  name: 'External API',
  circuitBreakerOptions: { /* ... */ },
  retryOptions: { /* ... */ },
});
```

This provides:
1. **Retry** - Handles transient failures
2. **Circuit Breaker** - Prevents cascading failures

## Monitoring and Observability

### Logging

Both utilities log important events:

```typescript
// Retry logs
logger.warn('Retrying operation', {
  attempt,
  maxAttempts,
  delayMs,
  error: error.message,
});

// Circuit breaker logs
logger.error('Circuit breaker opened', {
  name,
  failureCount,
  nextAttempt,
});

logger.info('Circuit breaker closed', {
  name,
  successCount,
});
```

### Metrics

Track circuit breaker state in your monitoring:

```typescript
const stats = breaker.getStats();
// {
//   state: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
//   failureCount: number,
//   successCount: number,
//   nextAttempt: string (ISO timestamp)
// }
```

## Configuration Recommendations

### Development Environment

```typescript
// More aggressive retries for faster feedback
{
  maxAttempts: 2,
  initialDelayMs: 50,
  maxDelayMs: 500,
}

// Lower thresholds for circuit breaker
{
  failureThreshold: 3,
  timeout: 10000, // 10 seconds
}
```

### Production Environment

```typescript
// Conservative retries to avoid overwhelming services
{
  maxAttempts: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
}

// Higher thresholds for circuit breaker
{
  failureThreshold: 5,
  timeout: 60000, // 1 minute
}
```

## Troubleshooting

### Circuit Breaker Stuck Open

If a circuit breaker is stuck open:

1. Check the service health
2. Review logs for the root cause
3. Manually reset if needed: `breaker.reset()`
4. Consider adjusting timeout or failure threshold

### Too Many Retries

If operations are retrying too much:

1. Reduce `maxAttempts`
2. Increase `initialDelayMs`
3. Add specific `retryableErrors` to be more selective
4. Consider if the operation should be retried at all

### Performance Impact

If retries are impacting performance:

1. Reduce `maxAttempts`
2. Reduce `maxDelayMs`
3. Use circuit breaker to fail fast
4. Consider async/background processing

## Future Enhancements

Potential improvements:

1. **Metrics Integration** - Export metrics to Prometheus/Datadog
2. **Adaptive Timeouts** - Adjust timeouts based on historical performance
3. **Bulkhead Pattern** - Limit concurrent requests to external services
4. **Fallback Strategies** - Provide fallback responses when circuit is open
5. **Health Checks** - Proactive health checking to open circuits early

## References

- [Requirement 10.4](../requirements.md#requirement-10-error-handling-and-user-feedback)
- [Design Document - Error Handling](../design.md#error-handling)
- [Martin Fowler - Circuit Breaker](https://martinfowler.com/bliki/CircuitBreaker.html)
- [AWS - Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
