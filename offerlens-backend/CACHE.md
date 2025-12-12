# Redis Cache Service

The OfferLens backend uses Redis for caching frequently accessed data and managing rate limiting counters.

## Features

- ✅ Connection pooling for optimal performance
- ✅ Automatic retry with exponential backoff
- ✅ Graceful degradation when Redis is unavailable
- ✅ Type-safe operations with TypeScript generics
- ✅ Comprehensive error handling and logging

## Setup

### Local Development with Docker

The easiest way to run Redis locally is using Docker Compose:

```bash
# Start Redis (and PostgreSQL)
docker-compose up -d redis

# Verify Redis is running
docker ps | grep redis
```

### Local Development without Docker

Install Redis locally:

**Windows:**
```bash
# Using Chocolatey
choco install redis-64

# Or download from: https://github.com/microsoftarchive/redis/releases
```

**macOS:**
```bash
brew install redis
brew services start redis
```

**Linux:**
```bash
sudo apt-get install redis-server
sudo systemctl start redis
```

### Production (Railway)

For production deployment on Railway:

1. Add the Redis plugin to your Railway project
2. Railway will automatically set the `REDIS_URL` environment variable
3. The cache service will connect automatically

## Usage

### Import the Service

```typescript
import { cacheService } from './services/cache.service';
// or
import cacheService from './services/cache.service';
```

### Basic Operations

#### Set a Value

```typescript
// Set a string
await cacheService.set('user:123', 'John Doe');

// Set an object
await cacheService.set('user:123:profile', {
  name: 'John Doe',
  email: 'john@example.com',
  role: 'admin'
});

// Set with TTL (time to live in seconds)
await cacheService.set('session:abc123', sessionData, 3600); // Expires in 1 hour
```

#### Get a Value

```typescript
// Get a string
const name = await cacheService.get<string>('user:123');

// Get an object
const profile = await cacheService.get<UserProfile>('user:123:profile');

// Returns null if key doesn't exist or Redis is unavailable
if (profile === null) {
  // Fetch from database
}
```

#### Delete a Value

```typescript
await cacheService.del('user:123');
```

#### Increment a Counter

```typescript
// Increment without TTL
const count = await cacheService.increment('api:requests:total');

// Increment with TTL (useful for rate limiting)
const requestCount = await cacheService.increment('rate-limit:ip:192.168.1.1', 60); // 60 seconds

if (requestCount > 100) {
  // Rate limit exceeded
}
```

### Check Connection Status

```typescript
// Check if Redis is connected
if (cacheService.isReady()) {
  console.log('Redis is connected');
}

// Ping Redis
const isAlive = await cacheService.ping();
```

## Common Use Cases

### 1. Caching Salary Benchmarks

```typescript
// Cache key pattern: salary:{role}:{experience}:{city}
const cacheKey = `salary:${role}:${experience}:${city}`;

// Try to get from cache
let salaryData = await cacheService.get<SalaryBenchmark>(cacheKey);

if (!salaryData) {
  // Cache miss - fetch from database
  salaryData = await prisma.salaryBenchmark.findFirst({
    where: { role, experienceLevel: experience, city }
  });
  
  // Cache for 1 hour (3600 seconds)
  if (salaryData) {
    await cacheService.set(cacheKey, salaryData, 3600);
  }
}

return salaryData;
```

### 2. Caching Red Flag Rules

```typescript
const cacheKey = 'red-flag-rules:active';

// Try to get from cache
let rules = await cacheService.get<RedFlagRule[]>(cacheKey);

if (!rules) {
  // Cache miss - fetch from database
  rules = await prisma.redFlagRule.findMany({
    where: { active: true }
  });
  
  // Cache for 1 hour
  await cacheService.set(cacheKey, rules, 3600);
}

return rules;
```

### 3. Rate Limiting

```typescript
// Rate limit: 10 requests per minute per IP
const ipAddress = req.ip;
const cacheKey = `rate-limit:${ipAddress}`;
const windowSeconds = 60;
const maxRequests = 10;

const requestCount = await cacheService.increment(cacheKey, windowSeconds);

if (requestCount > maxRequests) {
  return res.status(429).json({
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please try again later.',
    }
  });
}

// Process request
```

### 4. Invalidating Cache

```typescript
// When admin updates salary data
async function updateSalaryBenchmark(id: string, data: UpdateSalaryDTO) {
  // Update database
  const updated = await prisma.salaryBenchmark.update({
    where: { id },
    data
  });
  
  // Invalidate cache
  const cacheKey = `salary:${updated.role}:${updated.experienceLevel}:${updated.city}`;
  await cacheService.del(cacheKey);
  
  return updated;
}
```

## Cache Key Naming Conventions

Use consistent naming patterns for cache keys:

```
{resource}:{identifier}:{sub-resource}
```

Examples:
- `salary:software-engineer:senior:san-francisco`
- `red-flag-rules:active`
- `rate-limit:ip:192.168.1.1`
- `session:abc123`
- `user:123:profile`

## Graceful Degradation

The cache service is designed to fail gracefully when Redis is unavailable:

- **get()** returns `null` (same as cache miss)
- **set()** logs a warning and continues
- **del()** logs a warning and continues
- **increment()** returns `0`

This means your application will continue to work even if Redis is down, but without caching benefits.

## Error Handling

All cache operations catch errors internally and log them. They never throw exceptions to the caller. This ensures that cache failures don't break your application.

```typescript
// This will never throw, even if Redis is down
const data = await cacheService.get('some-key');

// Always check for null
if (data === null) {
  // Either cache miss or Redis unavailable
  // Fetch from primary data source
}
```

## Testing

The cache service includes comprehensive tests that work both with and without Redis:

```bash
# Run cache service tests
npm test -- cache.service.test.ts
```

Tests automatically detect if Redis is available and adjust expectations accordingly.

## Monitoring

The cache service logs all important events:

- Connection established
- Connection errors
- Retry attempts
- Cache operation failures

Monitor these logs to ensure Redis is healthy:

```bash
# View logs in development
npm run dev

# In production, use your logging aggregation service
```

## Performance Tips

1. **Use appropriate TTLs**: Don't cache data forever. Use TTLs based on how often data changes.
   - Salary benchmarks: 1 hour (3600s)
   - Red flag rules: 1 hour (3600s)
   - Rate limit counters: 1 minute (60s)

2. **Cache at the right layer**: Cache in the service layer, not in controllers.

3. **Invalidate proactively**: When data changes, invalidate the cache immediately.

4. **Monitor cache hit rates**: Track how often cache hits vs misses occur.

5. **Use connection pooling**: The service already handles this automatically.

## Troubleshooting

### Redis Connection Refused

**Symptom:** Logs show `ECONNREFUSED` errors

**Solution:**
```bash
# Check if Redis is running
docker ps | grep redis

# Start Redis
docker-compose up -d redis

# Or if running locally
redis-server
```

### High Memory Usage

**Symptom:** Redis using too much memory

**Solution:**
- Review TTL values (ensure data expires)
- Check for cache key leaks (keys without TTL)
- Monitor with `redis-cli info memory`

### Slow Cache Operations

**Symptom:** Cache operations taking too long

**Solution:**
- Check network latency to Redis
- Review connection pool settings
- Consider using Redis Cluster for scaling

## Configuration

Redis configuration is managed through environment variables:

```bash
# .env
REDIS_URL=redis://localhost:6379

# For Redis with password
REDIS_URL=redis://:password@localhost:6379

# For Redis Cluster
REDIS_URL=redis://node1:6379,redis://node2:6379
```

## Advanced Usage

### Direct Redis Client Access

For advanced operations not covered by the service methods:

```typescript
const client = cacheService.getClient();

// Use ioredis methods directly
await client.lpush('queue:jobs', JSON.stringify(job));
const job = await client.rpop('queue:jobs');
```

**Note:** Use this sparingly. Prefer adding methods to the CacheService class.

## Resources

- [ioredis Documentation](https://github.com/redis/ioredis)
- [Redis Commands](https://redis.io/commands)
- [Redis Best Practices](https://redis.io/docs/manual/patterns/)
