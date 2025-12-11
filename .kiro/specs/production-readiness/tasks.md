# Implementation Plan

- [ ] 1. Set up backend project structure and core infrastructure
  - Initialize Node.js/TypeScript project with Express
  - Configure TypeScript, ESLint, and Prettier
  - Set up project folder structure (controllers, services, models, middleware, utils)
  - Configure environment variables and config management (.env files)
  - Set up Docker and docker-compose for local development
  - _Requirements: 1.1, 9.1, 9.2_

- [ ] 2. Set up database and ORM
  - [ ] 2.1 Initialize PostgreSQL database with Docker
    - Create docker-compose configuration for PostgreSQL
    - Set up database initialization scripts
    - Configure database connection settings
    - _Requirements: 2.1, 5.1_

  - [ ] 2.2 Configure Prisma ORM
    - Install and initialize Prisma
    - Define database schema for salary_benchmarks, red_flag_rules, feature_requests, analytics_events, admin_users, feature_request_votes
    - Generate Prisma client
    - _Requirements: 2.1, 5.1_

  - [ ] 2.3 Create database migration scripts
    - Implement initial migration with all tables
    - Add indexes for performance optimization (role, experience, city lookups)
    - _Requirements: 5.1, 11.4, 13.4_

  - [ ] 2.4 Seed database with initial data
    - Migrate existing salary data from frontend to database
    - Migrate existing red flag rules to database
    - Create seed script for development environment
    - _Requirements: 4.1, 5.1_

- [ ] 3. Set up Redis cache
  - [ ] 3.1 Configure Redis with Docker
    - Add Redis to docker-compose
    - Configure connection settings and connection pooling
    - _Requirements: 11.3_

  - [ ] 3.2 Implement cache service
    - Create CacheService class with get, set, del, increment methods
    - Implement connection pooling and retry logic
    - Add error handling for cache failures (graceful degradation)
    - _Requirements: 11.3_

- [ ] 4. Implement API Gateway foundation
  - [ ] 4.1 Set up Express server with middleware
    - Configure Express app with JSON parsing and body limits
    - Add CORS middleware with whitelist configuration
    - Add request logging middleware (Winston)
    - Add error handling middleware
    - _Requirements: 1.1, 1.3, 1.5_

  - [ ] 4.2 Implement request validation with Zod
    - Create Zod schemas for all API endpoints
    - Implement validation middleware
    - _Requirements: 1.3, 6.3_

  - [ ] 4.3 Implement rate limiting
    - Create rate limiter middleware using Redis
    - Configure rate limits per endpoint (e.g., 10 requests/minute for analysis)
    - Return 429 status with Retry-After header
    - _Requirements: 6.1, 6.2_

  - [ ]* 4.4 Write property test for rate limiting
    - **Property 10: Rate limit enforcement**
    - **Validates: Requirements 6.1**

  - [ ] 4.5 Implement input sanitization
    - Create sanitization utilities for user text inputs
    - Prevent SQL injection and XSS attacks
    - _Requirements: 6.3, 6.4_

  - [ ]* 4.6 Write property test for input sanitization
    - **Property 11: Input sanitization**
    - **Validates: Requirements 6.4**

  - [ ] 4.7 Implement request logging
    - Log all requests with timestamp, endpoint, IP hash, and response status
    - Use structured logging (JSON format)
    - _Requirements: 6.5, 8.2_

  - [ ]* 4.8 Write property test for request logging
    - **Property 12: Request logging completeness**
    - **Validates: Requirements 6.5**

- [ ] 5. Implement Analysis Engine service
  - [ ] 5.1 Create red flag detection logic
    - Implement pattern matching against database rules
    - Return detected flags with matched keywords and excerpts
    - Categorize by severity (high, medium, low)
    - _Requirements: 4.1, 4.3, 4.4_

  - [ ]* 5.2 Write property test for red flag detection
    - **Property 7: Red flag detection completeness**
    - **Validates: Requirements 4.1**

  - [ ]* 5.3 Write property test for red flag excerpts
    - **Property 8: Red flag excerpt inclusion**
    - **Validates: Requirements 4.3**

  - [ ]* 5.4 Write property test for red flag severity
    - **Property 9: Red flag severity validity**
    - **Validates: Requirements 4.4**

  - [ ] 5.5 Implement salary comparison logic
    - Query salary benchmarks from database/cache
    - Apply city multipliers
    - Calculate comparison (below/aligned/above)
    - _Requirements: 5.1, 5.3_

  - [ ] 5.6 Implement negotiation suggestions generator
    - Generate suggestions based on red flags and salary comparison
    - Prioritize suggestions by severity
    - _Requirements: 4.1_

  - [ ] 5.7 Create main analyze endpoint
    - Implement POST /api/v1/analyze endpoint
    - Coordinate red flag detection, salary comparison, and suggestions
    - Ensure no offer data is persisted
    - Return structured analysis response
    - _Requirements: 1.2, 2.1, 2.2, 2.3_

  - [ ]* 5.8 Write property test for no data persistence
    - **Property 3: No offer data persistence**
    - **Validates: Requirements 2.1, 2.3**

  - [ ]* 5.9 Write property test for stateless analysis
    - **Property 4: Stateless analysis idempotence**
    - **Validates: Requirements 2.2**

- [ ] 6. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 7. Implement OCR Service
  - [ ] 7.1 Set up PDF text extraction
    - Install and configure pdf-parse library
    - Implement PDF text extraction function
    - Handle extraction errors gracefully
    - _Requirements: 7.1, 7.3_

  - [ ] 7.2 Set up image OCR with Tesseract
    - Install and configure Tesseract.js
    - Implement image preprocessing with Sharp
    - Implement OCR extraction with confidence scoring
    - _Requirements: 7.2, 7.3_

  - [ ] 7.3 Create file upload endpoint
    - Implement POST /api/v1/extract-text endpoint
    - Validate file type and size (max 10MB)
    - Route to PDF or OCR extraction based on file type
    - Return extracted text with confidence score
    - _Requirements: 7.1, 7.2, 7.4, 7.5_

  - [ ]* 7.4 Write property test for file type validation
    - **Property 13: File type validation**
    - **Validates: Requirements 7.5**

  - [ ]* 7.5 Write unit tests for OCR service
    - Test PDF extraction with sample files
    - Test image OCR with sample images
    - Test error handling for corrupted files
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 8. Implement Feature Request Service
  - [ ] 8.1 Create feature request data model and repository
    - Implement Prisma model for feature requests
    - Create repository methods (create, findAll, findById, updateStatus)
    - _Requirements: 3.3_

  - [ ] 8.2 Implement feature request submission endpoint
    - Create POST /api/v1/feature-requests endpoint
    - Validate request data (type, title, description, optional email)
    - Store in database
    - Send email notification to admins
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 8.3 Write property test for feature request persistence
    - **Property 6: Feature request persistence**
    - **Validates: Requirements 3.3**

  - [ ] 8.4 Implement feature request listing endpoint
    - Create GET /api/v1/feature-requests endpoint
    - Support filtering by status and type
    - Return paginated results
    - _Requirements: 14.2_

  - [ ] 8.5 Implement voting functionality
    - Create POST /api/v1/feature-requests/:id/vote endpoint
    - Track votes by IP address to prevent duplicates
    - Increment vote count
    - _Requirements: 14.3_

  - [ ]* 8.6 Write property test for vote uniqueness
    - **Property 15: Forum vote uniqueness**
    - **Validates: Requirements 14.3**

- [ ] 9. Implement Admin Service
  - [ ] 9.1 Create admin authentication
    - Implement admin user model with bcrypt password hashing
    - Create POST /api/v1/admin/login endpoint with JWT generation
    - Implement JWT verification middleware
    - _Requirements: 5.2_

  - [ ] 9.2 Implement salary benchmark management
    - Create POST /api/v1/admin/salary-benchmarks endpoint
    - Create PUT /api/v1/admin/salary-benchmarks/:id endpoint
    - Invalidate cache on updates
    - _Requirements: 5.2, 5.3_

  - [ ] 9.3 Implement red flag rule management
    - Create POST /api/v1/admin/red-flag-rules endpoint
    - Create PUT /api/v1/admin/red-flag-rules/:id endpoint
    - Support activating/deactivating rules
    - Invalidate cache on updates
    - _Requirements: 4.5_

  - [ ] 9.4 Implement bulk data import
    - Create POST /api/v1/admin/salary-benchmarks/import endpoint
    - Support CSV and JSON file formats
    - Validate and parse bulk data
    - _Requirements: 5.5_

  - [ ] 9.5 Implement feature request status management
    - Create PUT /api/v1/admin/feature-requests/:id/status endpoint
    - Allow status updates with admin notes
    - _Requirements: 14.4, 14.5_

  - [ ]* 9.6 Write unit tests for admin service
    - Test authentication flow
    - Test authorization checks
    - Test data management operations
    - _Requirements: 5.2, 5.3, 4.5_

- [ ] 10. Implement Analytics Service
  - [ ] 10.1 Create analytics event tracking
    - Implement analytics event model
    - Create method to log events with anonymized data
    - Hash IP addresses before storing
    - _Requirements: 2.4, 8.1_

  - [ ]* 10.2 Write property test for anonymized logging
    - **Property 5: Anonymized logging**
    - **Validates: Requirements 2.4**

  - [ ] 10.3 Implement health check endpoints
    - Create GET /api/v1/health endpoint (liveness probe)
    - Create GET /api/v1/health/ready endpoint (readiness probe)
    - Check database and Redis connectivity
    - _Requirements: 8.3_

  - [ ] 10.4 Implement metrics tracking
    - Track API response times
    - Track error rates by endpoint
    - Log metrics for monitoring
    - _Requirements: 8.2_

- [ ] 11. Implement error handling and validation
  - [ ] 11.1 Create standardized error response format
    - Define ErrorResponse interface
    - Implement error formatting utility
    - Include error codes, messages, timestamps, and request IDs
    - _Requirements: 10.2_

  - [ ]* 11.2 Write property test for structured error responses
    - **Property 14: Structured error responses**
    - **Validates: Requirements 10.2**

  - [ ] 11.3 Implement global error handler
    - Catch all unhandled errors
    - Log errors with full context
    - Return appropriate HTTP status codes
    - Never expose sensitive information
    - _Requirements: 10.1, 10.2_

  - [ ] 11.4 Implement retry logic for transient failures
    - Add exponential backoff for database operations
    - Add circuit breaker for external services
    - _Requirements: 10.4_

  - [ ]* 11.5 Write unit tests for error handling
    - Test validation errors (400)
    - Test authentication errors (401)
    - Test rate limit errors (429)
    - Test server errors (500)
    - _Requirements: 10.1, 10.2_

- [ ] 12. Implement utility endpoints
  - [ ] 12.1 Create metadata endpoints
    - Implement GET /api/v1/roles endpoint
    - Implement GET /api/v1/experience-levels endpoint
    - Implement GET /api/v1/cities endpoint
    - Cache responses in Redis
    - _Requirements: 5.1_

  - [ ]* 12.2 Write property test for JSON response structure
    - **Property 2: JSON response structure**
    - **Validates: Requirements 1.4**

  - [ ]* 12.3 Write property test for request validation
    - **Property 1: Request validation rejection**
    - **Validates: Requirements 1.3**

- [ ] 13. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 14. Update frontend to use backend API
  - [ ] 14.1 Create API client service
    - Implement axios-based API client
    - Configure base URL and headers
    - Add request/response interceptors
    - _Requirements: 1.1, 1.2_

  - [ ] 14.2 Update OfferContext to call backend
    - Replace local analysis logic with API calls
    - Call POST /api/v1/analyze endpoint
    - Handle loading and error states
    - _Requirements: 1.2, 2.2_

  - [ ] 14.3 Update FileUpload component
    - Call POST /api/v1/extract-text endpoint
    - Handle file upload with FormData
    - Display extraction progress
    - _Requirements: 7.1, 7.2_

  - [ ] 14.4 Implement feature request form
    - Create new FeatureRequest component
    - Call POST /api/v1/feature-requests endpoint
    - Show success/error feedback
    - _Requirements: 3.1, 3.2, 3.3_

  - [ ] 14.5 Implement optional feedback forum
    - Create FeedbackForum component
    - Fetch and display feature requests
    - Implement voting functionality
    - Display status labels
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [ ] 14.6 Implement error handling in frontend
    - Display user-friendly error messages
    - Show maintenance page when backend is down
    - Implement retry logic for failed requests
    - _Requirements: 10.1, 10.3_

  - [ ] 14.7 Implement PDF download functionality
    - Add download button to Results page
    - Generate PDF from analysis results
    - Allow local storage of results
    - _Requirements: 2.5_

  - [ ]* 14.8 Write end-to-end tests for critical flows
    - Test upload → analyze → view results flow
    - Test feature request submission
    - Test error scenarios
    - _Requirements: 12.3_

- [ ] 15. Set up deployment infrastructure
  - [ ] 15.1 Create production Docker configuration
    - Create optimized Dockerfile for backend
    - Create docker-compose for production
    - Configure multi-stage builds
    - _Requirements: 13.1_

  - [ ] 15.2 Set up environment configuration
    - Create .env.example files
    - Document all required environment variables
    - Set up separate configs for dev/staging/prod
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ] 15.3 Set up CI/CD pipeline
    - Configure GitHub Actions workflow
    - Add linting and type checking steps
    - Add test execution steps
    - Add Docker image building
    - _Requirements: 13.1, 13.2_

  - [ ] 15.4 Configure automated deployment
    - Set up staging deployment on successful builds
    - Require manual approval for production
    - Implement database migration automation
    - Implement rollback capability
    - _Requirements: 13.2, 13.3, 13.4, 13.5_

  - [ ] 15.5 Set up monitoring and alerting
    - Configure log aggregation
    - Set up error rate alerts
    - Set up performance monitoring
    - Configure health check monitoring
    - _Requirements: 8.2, 8.3, 8.5_

  - [ ]* 15.6 Write performance tests
    - Test 100 concurrent requests
    - Validate 95th percentile response time < 2 seconds
    - Test rate limiting under load
    - _Requirements: 11.1, 11.2, 12.5_

- [ ] 16. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all endpoints are working
  - Verify frontend-backend integration
  - Verify deployment pipeline
