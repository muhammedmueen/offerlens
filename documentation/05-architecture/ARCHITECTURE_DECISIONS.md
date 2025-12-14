# Architecture Decision Records (ADRs)

This document records the key architectural decisions made for the OfferLens application.

## Table of Contents

- [ADR-001: Separate Backend Architecture](#adr-001-separate-backend-architecture)
- [ADR-002: Technology Stack Selection](#adr-002-technology-stack-selection)
- [ADR-003: Privacy-First Architecture](#adr-003-privacy-first-architecture)
- [ADR-004: Caching Strategy](#adr-004-caching-strategy)
- [ADR-005: Testing Approach](#adr-005-testing-approach)

---

## ADR-001: Separate Backend Architecture

**Status:** Accepted  
**Date:** 2024-12-01  
**Decision Makers:** Development Team

### Context

The initial OfferLens application was a client-side only React application with:
- Hardcoded business logic in the frontend
- No persistent storage
- Limited scalability
- No ability to update rules without redeployment
- No analytics or monitoring capabilities

### Decision

We decided to implement a separate backend service with a RESTful API architecture.

**Architecture:**
```
React Frontend (Vercel) ←→ Express Backend (Railway) ←→ PostgreSQL + Redis
```

### Rationale

**Pros:**
- **Scalability**: Backend can scale independently of frontend
- **Security**: Sensitive operations (admin, database access) isolated from client
- **Maintainability**: Clear separation of concerns
- **Flexibility**: Can support multiple clients (web, mobile, API consumers)
- **Data Management**: Centralized data storage and management
- **Analytics**: Server-side tracking and monitoring
- **Dynamic Updates**: Update rules and data without frontend redeployment

**Cons:**
- Increased complexity
- Additional infrastructure costs
- More deployment steps
- Network latency for API calls

### Alternatives Considered

1. **Serverless Functions (AWS Lambda, Vercel Functions)**
   - Rejected: Cold start latency, limited execution time, harder to manage state

2. **Monolithic Full-Stack Framework (Next.js)**
   - Rejected: Wanted clear separation, different deployment strategies for frontend/backend

3. **Keep Client-Side Only**
   - Rejected: Doesn't meet scalability and management requirements

### Consequences

**Positive:**
- Can update salary data and red flag rules without redeployment
- Better security for sensitive operations
- Improved performance through caching
- Better monitoring and analytics
- Easier to add new features (user accounts, saved analyses)

**Negative:**
- More complex deployment process
- Need to manage CORS
- Additional infrastructure costs (~$5-40/month)
- Network dependency for all operations

### Validation

**Requirements Met:**
- ✅ Requirement 1.1: RESTful API backend service
- ✅ Requirement 2.1: Privacy-first (no offer data persistence)
- ✅ Requirement 4.5: Dynamic rule updates
- ✅ Requirement 5.2: Admin interface for data management

---

## ADR-002: Technology Stack Selection

**Status:** Accepted  
**Date:** 2024-12-01  
**Decision Makers:** Development Team

### Context

Need to select technologies for backend, database, caching, and deployment platforms.

### Decision

**Backend:**
- Node.js 20+ with TypeScript
- Express.js for API framework
- Prisma ORM for database access

**Database:**
- PostgreSQL 15+ for persistent storage
- Redis 7+ for caching and rate limiting

**Deployment:**
- Railway for backend (primary)
- Vercel for frontend (primary)

### Rationale

**Node.js + TypeScript:**
- **Pros**: Same language as frontend, large ecosystem, good performance, strong typing
- **Cons**: Single-threaded (mitigated by clustering)
- **Alternatives**: Python (Flask/FastAPI), Go, Java (Spring Boot)

**Express.js:**
- **Pros**: Mature, flexible, large ecosystem, well-documented
- **Cons**: Minimal (need to add middleware)
- **Alternatives**: Fastify (faster but less mature), Koa, NestJS (more opinionated)

**Prisma:**
- **Pros**: Type-safe, great DX, automatic migrations, Prisma Studio
- **Cons**: Adds abstraction layer
- **Alternatives**: TypeORM, Sequelize, raw SQL

**PostgreSQL:**
- **Pros**: Mature, reliable, ACID compliant, JSON support, full-text search
- **Cons**: More complex than NoSQL
- **Alternatives**: MySQL, MongoDB, DynamoDB

**Redis:**
- **Pros**: Fast, simple, perfect for caching and rate limiting
- **Cons**: In-memory (limited by RAM)
- **Alternatives**: Memcached, in-memory cache

**Railway:**
- **Pros**: Easy setup, auto-provisions databases, affordable, great DX
- **Cons**: Smaller than AWS/GCP
- **Alternatives**: AWS (more complex), Heroku (expensive), Render, DigitalOcean

**Vercel:**
- **Pros**: Optimized for React, global CDN, automatic previews, free tier
- **Cons**: Vendor lock-in
- **Alternatives**: Netlify, AWS S3+CloudFront, DigitalOcean App Platform

### Consequences

**Positive:**
- Rapid development with TypeScript and Prisma
- Easy deployment with Railway and Vercel
- Low cost for small scale ($5-40/month)
- Great developer experience
- Type safety across stack

**Negative:**
- Learning curve for Prisma
- Railway is smaller provider (less mature than AWS)
- Vendor lock-in to some extent

### Validation

**Requirements Met:**
- ✅ Requirement 9.1: Environment-specific configuration
- ✅ Requirement 11.3: Caching for performance
- ✅ Requirement 13.1: CI/CD pipeline support

---

## ADR-003: Privacy-First Architecture

**Status:** Accepted  
**Date:** 2024-12-01  
**Decision Makers:** Development Team, Legal Advisor

### Context

Job offer letters contain sensitive personal and financial information. Users need assurance that their data is private and not stored.

### Decision

Implement a **zero-persistence architecture** for user offer data:

1. **No Storage**: Offer text is never stored in database
2. **Stateless Processing**: Analysis is performed in-memory
3. **Immediate Disposal**: Offer data is discarded after response
4. **Anonymized Analytics**: Only anonymized metadata is logged
5. **Client-Side Download**: Users can download results as PDF/JSON for local storage

### Rationale

**Pros:**
- **Privacy**: No risk of data breaches exposing offer letters
- **Trust**: Users more likely to use service
- **Compliance**: Easier GDPR/privacy law compliance
- **Simplicity**: No need for data retention policies
- **Security**: Reduced attack surface

**Cons:**
- **No History**: Users can't view past analyses
- **No Comparison**: Can't compare multiple offers server-side
- **Limited Analytics**: Can't analyze offer text patterns

### Alternatives Considered

1. **Store Encrypted Offers**
   - Rejected: Still a target for attackers, complex key management

2. **Store with User Consent**
   - Rejected: Adds complexity, most users would decline

3. **Store Anonymized Excerpts**
   - Rejected: Risk of re-identification

### Implementation

**Backend:**
```typescript
// Analysis is stateless
export async function analyzeOffer(request: AnalysisRequest): Promise<AnalysisResponse> {
  // Process in memory
  const redFlags = detectRedFlags(request.offerText);
  const salary = compareSalary(request);
  const suggestions = generateSuggestions(redFlags, salary);
  
  // Return results (offer text not included)
  return {
    redFlags,
    salaryComparison: salary,
    negotiationSuggestions: suggestions,
    analysisId: generateTempId(), // For download only
  };
  
  // Offer text is garbage collected
}
```

**Analytics:**
```typescript
// Only log anonymized metadata
await logAnalyticsEvent({
  eventType: 'analysis_completed',
  metadata: {
    role: request.role,
    experience: request.experience,
    city: request.city,
    redFlagCount: redFlags.length,
    // NO offer text
  },
  ipAddressHash: hashIp(request.ip),
});
```

### Consequences

**Positive:**
- Strong privacy guarantee
- User trust and confidence
- Simplified compliance
- Reduced security risk
- Clear value proposition

**Negative:**
- Can't offer "saved analyses" feature
- Can't do server-side offer comparison
- Limited ability to improve detection from real data

### Validation

**Requirements Met:**
- ✅ Requirement 2.1: No offer data persistence
- ✅ Requirement 2.2: Stateless processing
- ✅ Requirement 2.3: No storage after analysis
- ✅ Requirement 2.4: Anonymized logging only
- ✅ Requirement 2.5: Client-side download option

---

## ADR-004: Caching Strategy

**Status:** Accepted  
**Date:** 2024-12-01  
**Decision Makers:** Development Team

### Context

Salary benchmarks and red flag rules are:
- Queried frequently (every analysis)
- Change infrequently (quarterly for salary, rarely for rules)
- Same for all users
- Expensive to query from database repeatedly

### Decision

Implement **Redis caching** with the following strategy:

**What to Cache:**
1. Salary benchmarks (1 hour TTL)
2. Red flag rules (1 hour TTL)
3. Metadata (roles, cities, experience levels) (24 hour TTL)

**What NOT to Cache:**
- User offer data (privacy)
- Analysis results (stateless)
- Feature requests (dynamic)
- Analytics events (write-heavy)

**Cache Invalidation:**
- Automatic expiration (TTL)
- Manual invalidation on admin updates
- Cache warming on startup (optional)

### Rationale

**Pros:**
- **Performance**: Sub-millisecond cache hits vs 10-50ms database queries
- **Scalability**: Reduces database load
- **Cost**: Fewer database queries
- **Reliability**: Graceful degradation if cache fails

**Cons:**
- **Complexity**: Additional infrastructure
- **Stale Data**: Possible for up to 1 hour
- **Cost**: Redis hosting (~$7-15/month)

### Alternatives Considered

1. **In-Memory Cache (Node.js)**
   - Rejected: Doesn't work with multiple instances, lost on restart

2. **No Caching**
   - Rejected: Poor performance, high database load

3. **CDN Caching**
   - Rejected: Not suitable for dynamic API responses

### Implementation

**Cache Service:**
```typescript
// src/services/cache.service.ts
class CacheService {
  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await redis.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      logger.warn('Cache get failed', { key, error });
      return null; // Graceful degradation
    }
  }
  
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await redis.set(key, JSON.stringify(value), 'EX', ttl || 3600);
    } catch (error) {
      logger.warn('Cache set failed', { key, error });
      // Continue without caching
    }
  }
}
```

**Usage:**
```typescript
// Try cache first
const cacheKey = `salary:${role}:${experience}:${city}`;
let salaryData = await cacheService.get<SalaryBenchmark>(cacheKey);

if (!salaryData) {
  // Cache miss - query database
  salaryData = await prisma.salaryBenchmark.findFirst({
    where: { role, experienceLevel: experience, city },
  });
  
  // Cache for 1 hour
  if (salaryData) {
    await cacheService.set(cacheKey, salaryData, 3600);
  }
}
```

**Invalidation:**
```typescript
// When admin updates salary data
async function updateSalaryBenchmark(id: string, data: UpdateDTO) {
  const updated = await prisma.salaryBenchmark.update({
    where: { id },
    data,
  });
  
  // Invalidate cache
  const cacheKey = `salary:${updated.role}:${updated.experienceLevel}:${updated.city}`;
  await cacheService.del(cacheKey);
  
  return updated;
}
```

### Consequences

**Positive:**
- 10-100x faster response times for cached data
- Reduced database load (80-90% cache hit rate expected)
- Better scalability
- Graceful degradation if Redis fails

**Negative:**
- Additional infrastructure to manage
- Possible stale data (max 1 hour)
- Cache invalidation complexity
- Additional cost

### Validation

**Requirements Met:**
- ✅ Requirement 11.1: Sub-2-second response times
- ✅ Requirement 11.3: Caching for frequently accessed data
- ✅ Requirement 11.5: Horizontal scaling support

---

## ADR-005: Testing Approach

**Status:** Accepted  
**Date:** 2024-12-01  
**Decision Makers:** Development Team

### Context

Need a comprehensive testing strategy that balances:
- Code quality and correctness
- Development speed
- Maintenance burden
- CI/CD integration

### Decision

Implement a **multi-layered testing approach**:

1. **Unit Tests** (Jest)
   - Test individual functions and classes
   - Mock external dependencies
   - Fast execution (< 1 second)
   - Target: 80% code coverage

2. **Integration Tests** (Supertest)
   - Test API endpoints end-to-end
   - Use test database
   - Test authentication and authorization
   - Test error handling

3. **Property-Based Tests** (fast-check) - Optional
   - Test universal properties
   - Generate random inputs
   - Catch edge cases
   - Run 100+ iterations per property

4. **Manual Testing**
   - Critical user flows
   - UI/UX validation
   - Cross-browser testing
   - Mobile responsiveness

### Rationale

**Unit Tests:**
- **Pros**: Fast, isolated, easy to write
- **Cons**: Don't test integration
- **When**: Business logic, utilities, services

**Integration Tests:**
- **Pros**: Test real behavior, catch integration bugs
- **Cons**: Slower, more complex setup
- **When**: API endpoints, database operations

**Property-Based Tests:**
- **Pros**: Find edge cases, comprehensive coverage
- **Cons**: Complex to write, slower
- **When**: Critical algorithms, validation logic

### Alternatives Considered

1. **E2E Tests Only (Playwright/Cypress)**
   - Rejected: Too slow for CI, brittle, hard to debug

2. **No Tests**
   - Rejected: Unacceptable for production application

3. **TDD (Test-Driven Development)**
   - Rejected: Too rigid for rapid prototyping phase

### Implementation

**Unit Test Example:**
```typescript
// src/services/__tests__/analysis.service.test.ts
describe('AnalysisService', () => {
  describe('detectRedFlags', () => {
    it('should detect training bond clause', () => {
      const offerText = 'You must serve for 2 years or pay back Rs. 2,00,000';
      const flags = detectRedFlags(offerText);
      
      expect(flags).toHaveLength(1);
      expect(flags[0].id).toBe('training-bond');
      expect(flags[0].severity).toBe('high');
    });
  });
});
```

**Integration Test Example:**
```typescript
// src/controllers/__tests__/analysis.controller.test.ts
describe('POST /api/v1/analyze', () => {
  it('should return analysis results', async () => {
    const response = await request(app)
      .post('/api/v1/analyze')
      .send({
        offerText: 'Sample offer letter...',
        role: 'Software Engineer',
        experience: '3-5 years',
        ctc: 25,
        city: 'Bangalore',
      })
      .expect(200);
    
    expect(response.body).toHaveProperty('redFlags');
    expect(response.body).toHaveProperty('salaryComparison');
  });
});
```

**Property-Based Test Example:**
```typescript
// src/services/__tests__/validation.property.test.ts
import fc from 'fast-check';

describe('Property: Input sanitization', () => {
  it('should remove dangerous characters from all strings', () => {
    fc.assert(
      fc.property(
        fc.string(),
        (input) => {
          const sanitized = sanitizeString(input);
          expect(sanitized).not.toContain('<');
          expect(sanitized).not.toContain('>');
          expect(sanitized).not.toMatch(/javascript:/i);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Consequences

**Positive:**
- High confidence in code quality
- Catch bugs early
- Safe refactoring
- Documentation through tests
- CI/CD integration

**Negative:**
- Time investment to write tests
- Maintenance burden
- Slower development initially
- Test infrastructure complexity

### Validation

**Requirements Met:**
- ✅ Requirement 12.1: 80% unit test coverage
- ✅ Requirement 12.2: Integration tests for all endpoints
- ✅ Requirement 12.4: Automated testing in CI/CD
- ✅ Requirement 12.5: Performance tests

---

## Summary

These architectural decisions form the foundation of the OfferLens application:

1. **Separate Backend**: Enables scalability and dynamic updates
2. **Modern Stack**: TypeScript, Express, Prisma, PostgreSQL, Redis
3. **Privacy-First**: Zero persistence of user offer data
4. **Caching**: Redis for performance and scalability
5. **Testing**: Multi-layered approach for quality and confidence

Each decision was made with careful consideration of trade-offs and alignment with project requirements.

---

**Last Updated**: December 12, 2024  
**Maintained By**: OfferLens Team
