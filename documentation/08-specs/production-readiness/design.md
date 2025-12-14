# Design Document

## Overview

OfferLens will be transformed from a client-side only application into a production-ready system with a separate backend service. The architecture follows a privacy-first approach where user offer letter data is never persisted, ensuring complete confidentiality. The system will consist of a React frontend, a Node.js/Express backend API, and minimal database storage for system data only (salary benchmarks, feature requests, red flag rules).

The design emphasizes:
- **Privacy**: Zero persistence of user offer data
- **Scalability**: Stateless API design for horizontal scaling
- **Maintainability**: Clear separation of concerns between frontend and backend
- **Extensibility**: Admin interfaces for updating rules and salary data
- **Performance**: Caching and optimized processing for sub-2-second response times

## Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Client Layer                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         React SPA (Vite + TypeScript)                  │ │
│  │  - Upload Interface                                    │ │
│  │  - Results Display                                     │ │
│  │  - Feature Request Form                                │ │
│  │  - Optional: Feedback Forum                            │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                       │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Express.js API Server                          │ │
│  │  - Request Validation                                  │ │
│  │  - Rate Limiting                                       │ │
│  │  - CORS Management                                     │ │
│  │  - Error Handling                                      │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     Business Logic Layer                     │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Analysis Engine │  │  OCR Service     │                │
│  │  - Red Flag      │  │  - PDF Extract   │                │
│  │  - Salary Comp   │  │  - Image OCR     │                │
│  │  - Negotiation   │  │                  │                │
│  └──────────────────┘  └──────────────────┘                │
│  ┌──────────────────┐  ┌──────────────────┐                │
│  │  Feature Request │  │  Admin Service   │                │
│  │  Service         │  │  - Update Rules  │                │
│  │                  │  │  - Update Salary │                │
│  └──────────────────┘  └──────────────────┘                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                       Data Layer                             │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         PostgreSQL Database                            │ │
│  │  - Salary Benchmarks                                   │ │
│  │  - Red Flag Rules                                      │ │
│  │  - Feature Requests                                    │ │
│  │  - Feedback Forum (Optional)                           │ │
│  │  - Analytics Metadata                                  │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Redis Cache                                    │ │
│  │  - Salary Data Cache                                   │ │
│  │  - Red Flag Rules Cache                                │ │
│  │  - Rate Limit Counters                                 │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Frontend:**
- React 18 with TypeScript
- Vite for build tooling
- TanStack Query for API state management
- Shadcn/ui component library
- Tailwind CSS for styling

**Backend:**
- Node.js 20+ with TypeScript
- Express.js for API framework
- Zod for request validation
- Winston for logging
- Bull for job queues (OCR processing)

**Data Storage:**
- PostgreSQL 15+ for persistent data
- Redis 7+ for caching and rate limiting
- Prisma ORM for database access

**File Processing:**
- pdf-parse for PDF text extraction
- Tesseract.js for OCR (images)
- Sharp for image preprocessing

**Infrastructure:**
- Docker for containerization
- Nginx as reverse proxy
- PM2 for process management
- GitHub Actions for CI/CD

## Components and Interfaces

### 1. API Gateway

**Responsibilities:**
- Route incoming HTTP requests to appropriate services
- Validate request payloads using Zod schemas
- Enforce rate limiting per IP address
- Handle CORS for allowed origins
- Transform errors into user-friendly responses
- Log all requests for analytics

**Key Endpoints:**

```typescript
POST   /api/v1/analyze
POST   /api/v1/extract-text
POST   /api/v1/feature-requests
GET    /api/v1/feature-requests
POST   /api/v1/feature-requests/:id/vote
GET    /api/v1/health
GET    /api/v1/roles
GET    /api/v1/experience-levels
GET    /api/v1/cities

// Admin endpoints (protected)
POST   /api/v1/admin/salary-benchmarks
PUT    /api/v1/admin/salary-benchmarks/:id
POST   /api/v1/admin/red-flag-rules
PUT    /api/v1/admin/red-flag-rules/:id
PUT    /api/v1/admin/feature-requests/:id/status
```

### 2. Analysis Engine

**Responsibilities:**
- Detect red flags in offer text using rule-based pattern matching
- Compare offered salary against market benchmarks
- Generate personalized negotiation suggestions
- Calculate take-home salary estimates
- Return analysis results without storing offer data

**Interface:**

```typescript
interface AnalysisRequest {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
}

interface AnalysisResponse {
  redFlags: DetectedRedFlag[];
  salaryComparison: {
    range: SalaryRange;
    comparison: 'below' | 'aligned' | 'above';
    difference: number;
    message: string;
  };
  takeHome: number;
  negotiationSuggestions: NegotiationSuggestion[];
  analysisId: string; // Temporary ID for download, not stored
}

class AnalysisEngine {
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse>;
  private detectRedFlags(text: string): DetectedRedFlag[];
  private compareSalary(role: string, exp: string, ctc: number, city: string): SalaryComparison;
  private generateSuggestions(flags: DetectedRedFlag[], salary: SalaryComparison): NegotiationSuggestion[];
}
```

### 3. OCR Service

**Responsibilities:**
- Extract text from PDF files
- Perform OCR on image files (JPEG, PNG)
- Preprocess images for better OCR accuracy
- Handle extraction failures gracefully
- Queue long-running OCR jobs

**Interface:**

```typescript
interface TextExtractionRequest {
  file: Buffer;
  fileType: 'pdf' | 'image';
  fileName: string;
}

interface TextExtractionResponse {
  text: string;
  confidence: number; // 0-1 for OCR
  success: boolean;
  error?: string;
}

class OCRService {
  async extractFromPDF(buffer: Buffer): Promise<string>;
  async extractFromImage(buffer: Buffer): Promise<TextExtractionResponse>;
  private preprocessImage(buffer: Buffer): Promise<Buffer>;
}
```

### 4. Feature Request Service

**Responsibilities:**
- Store and retrieve feature requests
- Validate request submissions
- Send email notifications to admins
- Track request status and votes
- Provide public API for feedback forum

**Interface:**

```typescript
interface FeatureRequest {
  id: string;
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
  status: 'submitted' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
  votes: number;
  createdAt: Date;
  updatedAt: Date;
}

class FeatureRequestService {
  async create(request: CreateFeatureRequestDTO): Promise<FeatureRequest>;
  async findAll(filters?: FeatureRequestFilters): Promise<FeatureRequest[]>;
  async vote(id: string, ipAddress: string): Promise<void>;
  async updateStatus(id: string, status: string, adminNote?: string): Promise<FeatureRequest>;
}
```

### 5. Admin Service

**Responsibilities:**
- Authenticate admin users
- Update salary benchmark data
- Update red flag rules
- Manage feature request statuses
- Bulk import data from CSV/JSON

**Interface:**

```typescript
interface AdminAuth {
  username: string;
  passwordHash: string;
  role: 'admin' | 'super_admin';
}

class AdminService {
  async authenticate(username: string, password: string): Promise<string>; // Returns JWT
  async updateSalaryBenchmark(data: SalaryBenchmarkDTO): Promise<void>;
  async updateRedFlagRule(data: RedFlagRuleDTO): Promise<void>;
  async bulkImportSalary(csvData: string): Promise<ImportResult>;
}
```

### 6. Cache Service

**Responsibilities:**
- Cache salary benchmark data
- Cache red flag rules
- Manage rate limit counters
- Invalidate cache on data updates

**Interface:**

```typescript
class CacheService {
  async get<T>(key: string): Promise<T | null>;
  async set<T>(key: string, value: T, ttl?: number): Promise<void>;
  async del(key: string): Promise<void>;
  async increment(key: string, ttl?: number): Promise<number>;
}
```

## Data Models

### Database Schema

```sql
-- Salary Benchmarks
CREATE TABLE salary_benchmarks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role VARCHAR(100) NOT NULL,
  experience_level VARCHAR(50) NOT NULL,
  city VARCHAR(100) NOT NULL,
  min_salary DECIMAL(10,2) NOT NULL,
  avg_salary DECIMAL(10,2) NOT NULL,
  max_salary DECIMAL(10,2) NOT NULL,
  effective_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(role, experience_level, city, effective_date)
);

CREATE INDEX idx_salary_lookup ON salary_benchmarks(role, experience_level, city);

-- Red Flag Rules
CREATE TABLE red_flag_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id VARCHAR(50) UNIQUE NOT NULL,
  severity VARCHAR(20) NOT NULL CHECK (severity IN ('high', 'medium', 'low')),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  keywords TEXT[] NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_active_rules ON red_flag_rules(active);

-- Feature Requests
CREATE TABLE feature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL CHECK (type IN ('role', 'feature', 'issue')),
  title VARCHAR(200) NOT NULL,
  description TEXT NOT NULL,
  user_email VARCHAR(255),
  status VARCHAR(30) NOT NULL DEFAULT 'submitted',
  votes INTEGER DEFAULT 0,
  admin_note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_feature_status ON feature_requests(status, created_at DESC);

-- Feature Request Votes (prevent duplicate votes)
CREATE TABLE feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
  ip_address VARCHAR(45) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(feature_request_id, ip_address)
);

-- Analytics Events (anonymized)
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  ip_address_hash VARCHAR(64), -- Hashed for privacy
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_type_date ON analytics_events(event_type, created_at DESC);

-- Admin Users
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

### TypeScript Models

```typescript
// Salary Benchmark
interface SalaryBenchmark {
  id: string;
  role: string;
  experienceLevel: string;
  city: string;
  minSalary: number;
  avgSalary: number;
  maxSalary: number;
  effectiveDate: Date;
}

// Red Flag Rule
interface RedFlagRule {
  id: string;
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  keywords: string[];
  active: boolean;
}

// Feature Request
interface FeatureRequest {
  id: string;
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
  status: 'submitted' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
  votes: number;
  adminNote?: string;
  createdAt: Date;
  updatedAt: Date;
}

// Analytics Event
interface AnalyticsEvent {
  id: string;
  eventType: string;
  metadata: Record<string, any>;
  ipAddressHash: string;
  createdAt: Date;
}
```


## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Request validation rejection
*For any* API request with invalid or malformed data, the API Gateway should reject the request with a 400 status code before processing
**Validates: Requirements 1.3**

### Property 2: JSON response structure
*For any* API endpoint response, the response should be valid JSON and include an appropriate HTTP status code (2xx, 4xx, or 5xx)
**Validates: Requirements 1.4**

### Property 3: No offer data persistence
*For any* offer analysis request, after processing completes, querying the database should return zero records containing the offer text
**Validates: Requirements 2.1, 2.3**

### Property 4: Stateless analysis idempotence
*For any* offer analysis request, processing the same request twice should produce equivalent results without side effects on system state
**Validates: Requirements 2.2**

### Property 5: Anonymized logging
*For any* log entry created by the system, the log should not contain offer text, email addresses, or other personally identifiable information
**Validates: Requirements 2.4**

### Property 6: Feature request persistence
*For any* valid feature request submission, the request should be stored in the database and retrievable by its ID
**Validates: Requirements 3.3**

### Property 7: Red flag detection completeness
*For any* offer text containing keywords from active red flag rules, the Analysis Engine should detect and return all matching red flags
**Validates: Requirements 4.1**

### Property 8: Red flag excerpt inclusion
*For any* detected red flag in an analysis response, the response should include the specific text excerpt that triggered the detection
**Validates: Requirements 4.3**

### Property 9: Red flag severity validity
*For any* detected red flag, the severity field should be one of: 'high', 'medium', or 'low'
**Validates: Requirements 4.4**

### Property 10: Rate limit enforcement
*For any* IP address, after making N requests within the time window (where N is the rate limit), the next request should receive HTTP 429 status
**Validates: Requirements 6.1**

### Property 11: Input sanitization
*For any* user-provided text input, dangerous characters and patterns (SQL injection, XSS) should be escaped or removed before processing
**Validates: Requirements 6.4**

### Property 12: Request logging completeness
*For any* API request, a log entry should be created containing timestamp, endpoint, IP address hash, and response status
**Validates: Requirements 6.5**

### Property 13: File type validation
*For any* file upload, if the file type is not in the allowed list (PDF, JPEG, PNG, TXT), the system should reject it with an error
**Validates: Requirements 7.5**

### Property 14: Structured error responses
*For any* error condition, the API should return a JSON response with an error code, message, and appropriate HTTP status code
**Validates: Requirements 10.2**

### Property 15: Forum vote uniqueness
*For any* feature request, a single IP address should only be able to vote once, and subsequent vote attempts should be rejected
**Validates: Requirements 14.3**

## Error Handling

### Error Categories

**1. Validation Errors (400 Bad Request)**
- Invalid request payload structure
- Missing required fields
- Invalid data types or formats
- Out-of-range values

**2. Authentication Errors (401 Unauthorized)**
- Invalid admin credentials
- Expired or invalid JWT tokens
- Missing authentication headers

**3. Authorization Errors (403 Forbidden)**
- Insufficient permissions for admin operations
- Blocked IP addresses

**4. Not Found Errors (404 Not Found)**
- Requested resource doesn't exist
- Invalid endpoint

**5. Rate Limit Errors (429 Too Many Requests)**
- Exceeded request rate limit
- Include Retry-After header

**6. Server Errors (500 Internal Server Error)**
- Unexpected exceptions
- Database connection failures
- External service failures (OCR, email)

### Error Response Format

All errors follow a consistent structure:

```typescript
interface ErrorResponse {
  error: {
    code: string;           // Machine-readable error code
    message: string;        // Human-readable message
    details?: any;          // Additional context (dev mode only)
    timestamp: string;      // ISO 8601 timestamp
    requestId: string;      // For tracking and debugging
  };
}
```

### Error Handling Strategy

**Client-Side:**
- Display user-friendly error messages
- Implement retry logic with exponential backoff for 5xx errors
- Show maintenance page when backend is unreachable
- Validate inputs before API calls to reduce errors

**Server-Side:**
- Log all errors with full context (stack trace, request details)
- Never expose sensitive information in error messages
- Use error monitoring service (e.g., Sentry) for alerting
- Implement circuit breakers for external services
- Graceful degradation when non-critical services fail

### Specific Error Scenarios

**OCR Failure:**
- Return partial results with warning
- Suggest manual text input
- Log failure for monitoring

**Database Connection Loss:**
- Return 503 Service Unavailable
- Implement connection pooling with retry
- Alert administrators immediately

**Rate Limit Exceeded:**
- Return 429 with Retry-After header
- Log potential abuse patterns
- Consider temporary IP blocking for severe abuse

**Invalid File Upload:**
- Validate file type and size before processing
- Return clear error message with supported formats
- Clean up temporary files immediately

## Testing Strategy

### Unit Testing

**Backend Services:**
- Test each service method in isolation
- Mock external dependencies (database, cache, OCR)
- Focus on business logic correctness
- Test edge cases and error conditions

**Key Areas:**
- Analysis Engine: Red flag detection, salary comparison logic
- Validation: Request payload validation with Zod
- Utilities: Text sanitization, hashing functions
- Data transformations: DTO mappings

**Tools:**
- Jest for test framework
- Supertest for API testing
- Mock libraries for dependencies

### Property-Based Testing

**Approach:**
- Use fast-check library for TypeScript
- Generate random inputs to test universal properties
- Run minimum 100 iterations per property
- Tag each test with the property number from design doc

**Properties to Test:**
1. Request validation rejection (Property 1)
2. JSON response structure (Property 2)
3. No offer data persistence (Property 3)
4. Stateless analysis idempotence (Property 4)
5. Anonymized logging (Property 5)
6. Red flag detection completeness (Property 7)
7. Red flag excerpt inclusion (Property 8)
8. Red flag severity validity (Property 9)
9. Input sanitization (Property 11)
10. Request logging completeness (Property 12)
11. File type validation (Property 13)
12. Structured error responses (Property 14)
13. Forum vote uniqueness (Property 15)

**Example Property Test:**

```typescript
// Property 3: No offer data persistence
import fc from 'fast-check';

describe('Property 3: No offer data persistence', () => {
  it('should not persist offer text after analysis', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.record({
          offerText: fc.string({ minLength: 100, maxLength: 5000 }),
          role: fc.constantFrom(...roles),
          experience: fc.constantFrom(...experienceLevels),
          ctc: fc.float({ min: 1, max: 100 }),
          city: fc.constantFrom(...cities),
        }),
        async (request) => {
          // Perform analysis
          const response = await analysisEngine.analyze(request);
          
          // Query database for offer text
          const results = await db.query(
            'SELECT * FROM analytics_events WHERE metadata::text LIKE $1',
            [`%${request.offerText.substring(0, 50)}%`]
          );
          
          // Assert no offer text is stored
          expect(results.rows.length).toBe(0);
        }
      ),
      { numRuns: 100 }
    );
  });
});
```

### Integration Testing

**API Endpoint Tests:**
- Test complete request/response cycles
- Use real database (test instance)
- Test authentication and authorization
- Verify error responses

**Test Scenarios:**
- POST /api/v1/analyze with valid offer data
- POST /api/v1/extract-text with PDF file
- POST /api/v1/feature-requests with various inputs
- Rate limiting behavior
- CORS policy enforcement
- Admin endpoints with authentication

### End-to-End Testing

**Critical User Flows:**
1. Upload offer → Analyze → View results → Download PDF
2. Submit feature request → View in forum → Vote
3. Admin login → Update salary data → Verify in analysis

**Tools:**
- Playwright or Cypress for browser automation
- Test against staging environment
- Run before production deployments

### Performance Testing

**Load Testing:**
- Simulate 100+ concurrent users
- Measure response times under load
- Identify bottlenecks
- Test rate limiting effectiveness

**Tools:**
- k6 or Artillery for load generation
- Monitor database query performance
- Profile API endpoints

**Targets:**
- 95th percentile response time < 2 seconds
- Support 100 concurrent requests
- Zero errors under normal load

### Test Data Management

**Fixtures:**
- Sample offer letters with known red flags
- Salary benchmark test data
- Feature request examples
- Admin user credentials (test only)

**Database Seeding:**
- Automated seed scripts for test data
- Separate test database instance
- Clean state before each test run

### Continuous Integration

**CI Pipeline:**
1. Lint code (ESLint, Prettier)
2. Type check (TypeScript)
3. Run unit tests
4. Run integration tests
5. Build Docker images
6. Deploy to staging
7. Run E2E tests
8. Generate coverage report

**Quality Gates:**
- 80% code coverage minimum
- Zero linting errors
- All tests passing
- No TypeScript errors

## Deployment Architecture

### Infrastructure Components

**Production Environment:**

```
┌─────────────────────────────────────────────────────────┐
│                    Load Balancer (Nginx)                 │
│                    - SSL Termination                     │
│                    - Rate Limiting                       │
│                    - Static File Serving                 │
└─────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
        ┌───────▼──────┐        ┌──────▼───────┐
        │  API Server  │        │  API Server  │
        │  Instance 1  │        │  Instance 2  │
        │  (Docker)    │        │  (Docker)    │
        └───────┬──────┘        └──────┬───────┘
                │                       │
                └───────────┬───────────┘
                            │
        ┌───────────────────┼───────────────────┐
        │                   │                   │
┌───────▼──────┐   ┌────────▼────────┐  ┌──────▼──────┐
│  PostgreSQL  │   │  Redis Cache    │  │  File       │
│  Primary     │   │  - Data Cache   │  │  Storage    │
│              │   │  - Rate Limits  │  │  (S3/Local) │
└──────────────┘   └─────────────────┘  └─────────────┘
```

### Deployment Strategy

**Blue-Green Deployment:**
1. Deploy new version to "green" environment
2. Run smoke tests on green
3. Switch load balancer to green
4. Keep blue as rollback option
5. Decommission blue after stability period

**Database Migrations:**
- Use Prisma migrations
- Run migrations before app deployment
- Test migrations on staging first
- Implement backward-compatible changes
- Keep rollback scripts ready

### Monitoring and Observability

**Metrics to Track:**
- API response times (p50, p95, p99)
- Error rates by endpoint
- Request volume
- Database query performance
- Cache hit rates
- OCR processing times
- Feature request submissions

**Logging:**
- Structured JSON logs
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized log aggregation (e.g., ELK stack)
- Log retention: 30 days

**Alerting:**
- Error rate > 5% for 5 minutes
- Response time p95 > 3 seconds
- Database connection failures
- Disk space < 20%
- Memory usage > 90%

**Health Checks:**
- Liveness probe: /api/v1/health
- Readiness probe: /api/v1/health/ready
- Check database connectivity
- Check Redis connectivity

### Security Considerations

**API Security:**
- HTTPS only (TLS 1.2+)
- CORS whitelist for allowed origins
- Rate limiting per IP
- Input validation and sanitization
- SQL injection prevention (parameterized queries)
- XSS prevention (output encoding)

**Data Security:**
- No storage of sensitive user data
- Hash IP addresses before logging
- Encrypt database backups
- Secure admin credentials (bcrypt)
- Environment variables for secrets
- Regular security audits

**Infrastructure Security:**
- Firewall rules (only necessary ports)
- Regular OS and dependency updates
- Container image scanning
- Principle of least privilege
- Network segmentation

### Scalability Plan

**Horizontal Scaling:**
- Add more API server instances
- Load balancer distributes traffic
- Stateless design enables easy scaling

**Database Scaling:**
- Read replicas for analytics queries
- Connection pooling
- Query optimization and indexing
- Consider sharding if needed (future)

**Caching Strategy:**
- Cache salary benchmarks (TTL: 1 hour)
- Cache red flag rules (TTL: 1 hour)
- Invalidate cache on admin updates
- Use Redis for distributed caching

**CDN for Static Assets:**
- Serve React app from CDN
- Cache static files (images, CSS, JS)
- Reduce load on origin server

### Backup and Disaster Recovery

**Database Backups:**
- Automated daily backups
- Retention: 30 days
- Test restore procedures monthly
- Store backups in separate region

**Recovery Time Objective (RTO):** 1 hour
**Recovery Point Objective (RPO):** 24 hours

**Disaster Recovery Plan:**
1. Detect outage via monitoring
2. Assess impact and root cause
3. Switch to backup infrastructure if needed
4. Restore from latest backup
5. Verify system functionality
6. Post-mortem and improvements

### Cost Optimization

**Infrastructure Costs:**
- Use auto-scaling to match demand
- Shut down staging during off-hours
- Optimize database instance size
- Use spot instances for non-critical workloads
- Monitor and eliminate unused resources

**Operational Costs:**
- Automate routine tasks
- Use managed services where appropriate
- Implement efficient caching
- Optimize database queries
- Monitor and reduce API calls to external services

## Future Enhancements

### Phase 2 Features

1. **AI-Powered Analysis**
   - Use LLMs for deeper offer analysis
   - Contextual red flag detection
   - Personalized negotiation strategies

2. **Multi-Language Support**
   - Internationalization (i18n)
   - Support for non-English offer letters
   - Localized salary benchmarks

3. **Comparison Tool**
   - Compare multiple offers side-by-side
   - Visual comparison charts
   - Decision-making framework

4. **Email Reports**
   - Send analysis results via email
   - Scheduled reminders for offer deadlines
   - Newsletter with salary trends

5. **Mobile App**
   - Native iOS and Android apps
   - Camera-based document scanning
   - Push notifications

### Technical Debt to Address

1. **Improve OCR Accuracy**
   - Better image preprocessing
   - Multiple OCR engines
   - Manual correction interface

2. **Enhanced Analytics**
   - User behavior tracking
   - A/B testing framework
   - Conversion funnel analysis

3. **API Versioning**
   - Implement proper API versioning
   - Deprecation strategy
   - Backward compatibility

4. **Documentation**
   - API documentation (OpenAPI/Swagger)
   - Developer guides
   - Architecture decision records (ADRs)

## Conclusion

This design provides a comprehensive blueprint for transforming OfferLens into a production-ready, scalable application. The architecture prioritizes user privacy by never storing sensitive offer data, while still providing robust analysis capabilities. The separation of frontend and backend enables independent scaling and future enhancements.

Key design decisions:
- **Privacy-first**: No persistence of user offer data
- **Stateless API**: Enables horizontal scaling
- **Comprehensive testing**: Unit, integration, property-based, and E2E tests
- **Monitoring and observability**: Full visibility into system health
- **Security**: Multiple layers of protection
- **Extensibility**: Admin interfaces for updating rules and data

The implementation plan will break down these components into manageable tasks, ensuring a systematic approach to building a production-grade application.
