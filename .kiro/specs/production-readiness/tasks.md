# Implementation Plan

- [x] 1. Set up backend project structure and core infrastructure













  - Initialize Node.js/TypeScript project with Express
  - Configure TypeScript, ESLint, and Prettier
  - Set up project folder structure (controllers, services, models, middleware, utils)
  - Configure environment variables and config management (.env files)
  - Set up Docker and docker-compose for local development
  - _Requirements: 1.1, 9.1, 9.2_

- [x] 2. Set up database and ORM




  - [x] 2.1 Initialize PostgreSQL database


    - For Railway: Use managed PostgreSQL plugin (recommended)
    - For local dev: Create docker-compose configuration for PostgreSQL
    - Set up database initialization scripts
    - Configure database connection settings
    - _Requirements: 2.1, 5.1_

  - [x] 2.2 Configure Prisma ORM


    - Install and initialize Prisma
    - Define database schema for salary_benchmarks, red_flag_rules, feature_requests, analytics_events, admin_users, feature_request_votes
    - Generate Prisma client
    - _Requirements: 2.1, 5.1_

  - [x] 2.3 Create database migration scripts


    - Implement initial migration with all tables
    - Add indexes for performance optimization (role, experience, city lookups)
    - _Requirements: 5.1, 11.4, 13.4_

  - [x] 2.4 Seed database with initial data


    - Migrate existing salary data from frontend to database
    - Migrate existing red flag rules to database
    - Create seed script for development environment
    - _Requirements: 4.1, 5.1_

- [x] 3. Set up Redis cache





  - [x] 3.1 Configure Redis


    - For Railway: Use managed Redis plugin (recommended)
    - For local dev: Add Redis to docker-compose
    - Configure connection settings and connection pooling
    - _Requirements: 11.3_

  - [x] 3.2 Implement cache service


    - Create CacheService class with get, set, del, increment methods
    - Implement connection pooling and retry logic
    - Add error handling for cache failures (graceful degradation)
    - _Requirements: 11.3_

- [x] 4. Implement API Gateway foundation





  - [x] 4.1 Set up Express server with middleware


    - Configure Express app with JSON parsing and body limits
    - Add CORS middleware with whitelist configuration
    - Add request logging middleware (Winston)
    - Add error handling middleware
    - _Requirements: 1.1, 1.3, 1.5_

  - [x] 4.2 Implement request validation with Zod


    - Create Zod schemas for all API endpoints
    - Implement validation middleware
    - _Requirements: 1.3, 6.3_

  - [x] 4.3 Implement rate limiting


    - Create rate limiter middleware using Redis
    - Configure rate limits per endpoint (e.g., 10 requests/minute for analysis)
    - Return 429 status with Retry-After header
    - _Requirements: 6.1, 6.2_

  - [ ]* 4.4 Write property test for rate limiting
    - **Property 10: Rate limit enforcement**
    - **Validates: Requirements 6.1**

  - [x] 4.5 Implement input sanitization


    - Create sanitization utilities for user text inputs
    - Prevent SQL injection and XSS attacks
    - _Requirements: 6.3, 6.4_

  - [ ]* 4.6 Write property test for input sanitization
    - **Property 11: Input sanitization**
    - **Validates: Requirements 6.4**

  - [x] 4.7 Implement request logging

    - Log all requests with timestamp, endpoint, IP hash, and response status
    - Use structured logging (JSON format)
    - _Requirements: 6.5, 8.2_

  - [ ]* 4.8 Write property test for request logging
    - **Property 12: Request logging completeness**
    - **Validates: Requirements 6.5**


- [x] 5. Implement Analysis Engine service




  - [x] 5.1 Create red flag detection logic


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


  - [x] 5.5 Implement salary comparison logic





    - Query salary benchmarks from database/cache
    - Apply city multipliers
    - Calculate comparison (below/aligned/above)
    - _Requirements: 5.1, 5.3_


  - [x] 5.6 Implement negotiation suggestions generator





    - Generate suggestions based on red flags and salary comparison
    - Prioritize suggestions by severity


    - _Requirements: 4.1_

  - [x] 5.7 Create main analyze endpoint





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

- [x] 6. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Implement OCR Service




  - [x] 7.1 Set up PDF text extraction


    - Install and configure pdf-parse library
    - Implement PDF text extraction function
    - Handle extraction errors gracefully
    - _Requirements: 7.1, 7.3_

  - [x] 7.2 Set up image OCR with Tesseract


    - Install and configure Tesseract.js
    - Implement image preprocessing with Sharp
    - Implement OCR extraction with confidence scoring
    - _Requirements: 7.2, 7.3_

  - [x] 7.3 Create file upload endpoint


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

- [x] 8. Implement Feature Request Service




  - [x] 8.1 Create feature request data model and repository


    - Implement Prisma model for feature requests
    - Create repository methods (create, findAll, findById, updateStatus)
    - _Requirements: 3.3_

  - [x] 8.2 Implement feature request submission endpoint


    - Create POST /api/v1/feature-requests endpoint
    - Validate request data (type, title, description, optional email)
    - Store in database
    - Send email notification to admins
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

  - [ ]* 8.3 Write property test for feature request persistence
    - **Property 6: Feature request persistence**
    - **Validates: Requirements 3.3**

  - [x] 8.4 Implement feature request listing endpoint

    - Create GET /api/v1/feature-requests endpoint
    - Support filtering by status and type
    - Return paginated results
    - _Requirements: 14.2_

  - [x] 8.5 Implement voting functionality

    - Create POST /api/v1/feature-requests/:id/vote endpoint
    - Track votes by IP address to prevent duplicates
    - Increment vote count
    - _Requirements: 14.3_

  - [ ]* 8.6 Write property test for vote uniqueness
    - **Property 15: Forum vote uniqueness**
    - **Validates: Requirements 14.3**

- [x] 9. Implement Admin Service




  - [x] 9.1 Create admin authentication


    - Implement admin user model with bcrypt password hashing
    - Create POST /api/v1/admin/login endpoint with JWT generation
    - Implement JWT verification middleware
    - _Requirements: 5.2_

  - [x] 9.2 Implement salary benchmark management

    - Create POST /api/v1/admin/salary-benchmarks endpoint
    - Create PUT /api/v1/admin/salary-benchmarks/:id endpoint
    - Invalidate cache on updates
    - _Requirements: 5.2, 5.3_

  - [x] 9.3 Implement red flag rule management

    - Create POST /api/v1/admin/red-flag-rules endpoint
    - Create PUT /api/v1/admin/red-flag-rules/:id endpoint
    - Support activating/deactivating rules
    - Invalidate cache on updates
    - _Requirements: 4.5_

  - [x] 9.4 Implement bulk data import

    - Create POST /api/v1/admin/salary-benchmarks/import endpoint
    - Support CSV and JSON file formats
    - Validate and parse bulk data
    - _Requirements: 5.5_

  - [x] 9.5 Implement feature request status management

    - Create PUT /api/v1/admin/feature-requests/:id/status endpoint
    - Allow status updates with admin notes
    - _Requirements: 14.4, 14.5_

  - [ ]* 9.6 Write unit tests for admin service
    - Test authentication flow
    - Test authorization checks
    - Test data management operations
    - _Requirements: 5.2, 5.3, 4.5_

- [x] 10. Implement Analytics Service




  - [x] 10.1 Create analytics event tracking


    - Implement analytics event model
    - Create method to log events with anonymized data
    - Hash IP addresses before storing
    - _Requirements: 2.4, 8.1_

  - [ ]* 10.2 Write property test for anonymized logging
    - **Property 5: Anonymized logging**
    - **Validates: Requirements 2.4**

  - [x] 10.3 Implement health check endpoints


    - Create GET /api/v1/health endpoint (liveness probe)
    - Create GET /api/v1/health/ready endpoint (readiness probe)
    - Check database and Redis connectivity
    - _Requirements: 8.3_

  - [x] 10.4 Implement metrics tracking


    - Track API response times
    - Track error rates by endpoint
    - Log metrics for monitoring
    - _Requirements: 8.2_

- [x] 11. Implement error handling and validation






  - [x] 11.1 Create standardized error response format


    - Define ErrorResponse interface
    - Implement error formatting utility
    - Include error codes, messages, timestamps, and request IDs
    - _Requirements: 10.2_

  - [ ]* 11.2 Write property test for structured error responses
    - **Property 14: Structured error responses**
    - **Validates: Requirements 10.2**

  - [x] 11.3 Implement global error handler


    - Catch all unhandled errors
    - Log errors with full context
    - Return appropriate HTTP status codes
    - Never expose sensitive information
    - _Requirements: 10.1, 10.2_

  - [x] 11.4 Implement retry logic for transient failures




    - Add exponential backoff for database operations
    - Add circuit breaker for external services
    - _Requirements: 10.4_

  - [ ]* 11.5 Write unit tests for error handling
    - Test validation errors (400)
    - Test authentication errors (401)
    - Test rate limit errors (429)
    - Test server errors (500)
    - _Requirements: 10.1, 10.2_

- [x] 12. Implement utility endpoints




  - [x] 12.1 Create metadata endpoints

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

- [x] 13. Checkpoint - Ensure all tests pass




  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Update frontend to use backend API




  - [x] 14.1 Create API client service


    - Implement axios-based API client
    - Configure base URL and headers
    - Add request/response interceptors
    - _Requirements: 1.1, 1.2_

  - [x] 14.2 Update OfferContext to call backend


    - Replace local analysis logic with API calls
    - Call POST /api/v1/analyze endpoint
    - Handle loading and error states
    - _Requirements: 1.2, 2.2_

  - [x] 14.3 Update FileUpload component


    - Call POST /api/v1/extract-text endpoint
    - Handle file upload with FormData
    - Display extraction progress
    - _Requirements: 7.1, 7.2_

  - [x] 14.4 Implement feature request form


    - Create new FeatureRequest component
    - Call POST /api/v1/feature-requests endpoint
    - Show success/error feedback
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 14.5 Implement optional feedback forum


    - Create FeedbackForum component
    - Fetch and display feature requests
    - Implement voting functionality
    - Display status labels
    - _Requirements: 14.1, 14.2, 14.3, 14.4_

  - [x] 14.6 Implement error handling in frontend


    - Display user-friendly error messages
    - Show maintenance page when backend is down
    - Implement retry logic for failed requests
    - _Requirements: 10.1, 10.3_

  - [x] 14.7 Implement PDF download functionality


    - Add download button to Results page
    - Generate PDF from analysis results
    - Allow local storage of results
    - _Requirements: 2.5_

  - [ ]* 14.8 Write end-to-end tests for critical flows
    - Test upload → analyze → view results flow
    - Test feature request submission
    - Test error scenarios
    - _Requirements: 12.3_

- [x] 15. Set up deployment infrastructure




  - [x] 15.1 (OPTIONAL) Create Docker configuration


    - Create optimized Dockerfile for backend
    - Create docker-compose for local development
    - Configure multi-stage builds
    - _Requirements: 13.1_
    - _Note: Railway supports native Node.js deployment without Docker_

  - [x] 15.2 Set up environment configuration


    - Create .env.example files for backend and frontend
    - Document all required environment variables
    - Set up separate configs for dev/staging/prod
    - Document Railway environment variable setup (DATABASE_URL, REDIS_URL, JWT_SECRET, CORS_ORIGIN, etc.)
    - Document Vercel environment variable setup (VITE_API_URL)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 15.3 Set up Railway backend deployment (PRIMARY)


    - Connect GitHub repository to Railway
    - Add PostgreSQL plugin (auto-provides DATABASE_URL)
    - Add Redis plugin (auto-provides REDIS_URL)
    - Configure environment variables (JWT_SECRET, CORS_ORIGIN, ADMIN_EMAIL, EMAIL_API_KEY)
    - Set up custom domain (optional)
    - Configure health check endpoints
    - Test deployment and verify database/Redis connectivity
    - _Requirements: 13.1, 13.2_

  - [x] 15.4 Set up Vercel frontend deployment (PRIMARY)


    - Import GitHub repository to Vercel
    - Configure build settings for Vite (build command: npm run build, output: dist)
    - Set VITE_API_URL environment variable pointing to Railway backend
    - Set up preview deployments for pull requests
    - Configure production domain
    - Test deployment and verify API connectivity
    - _Requirements: 13.1, 13.2_

  - [x] 15.5 Configure CI/CD and automated deployment


    - Railway auto-deploys on push to main branch
    - Vercel auto-deploys on push to main branch
    - Set up staging branches if needed (e.g., staging branch → Railway staging environment)
    - (Optional) Configure GitHub Actions for additional checks (linting, tests)
    - Implement database migration automation (run migrations on Railway deploy)
    - Document rollback procedures
    - _Requirements: 13.2, 13.3, 13.4, 13.5_

  - [x] 15.6 Set up monitoring and alerting


    - Configure Railway logging and metrics
    - Configure Vercel analytics
    - Set up error tracking (Sentry optional)
    - Set up uptime monitoring (UptimeRobot, Pingdom, or Railway built-in)
    - Configure health check monitoring
    - Set up alerts for errors and downtime
    - _Requirements: 8.2, 8.3, 8.5_

  - [ ]* 15.7 Write performance tests
    - Test 100 concurrent requests
    - Validate 95th percentile response time < 2 seconds
    - Test rate limiting under load
    - _Requirements: 11.1, 11.2, 12.5_

- [-] 16. Create comprehensive documentation and deployment guides





  - [ ] 16.1 Create local development setup guide
    - Document prerequisites (Node.js, Docker, PostgreSQL, Redis)
    - Step-by-step backend setup instructions
    - Environment variables configuration guide
    - Database setup and seeding instructions
    - Running the application locally (frontend + backend)
    - Troubleshooting common issues
    - _Requirements: 9.1, 9.2_


  - [x] 16.2 Create frontend-backend integration guide

    - Document API client setup and configuration
    - Environment variables for API endpoints (dev/staging/prod)
    - CORS configuration and troubleshooting
    - Authentication flow between frontend and backend
    - File upload integration (FormData handling)
    - Error handling and retry logic
    - Testing integration locally
    - Common integration issues and solutions
    - WebSocket/real-time features (if applicable)
    - _Requirements: 1.1, 1.2, 1.5, 14.1, 14.2_


  - [x] 16.3 Create API documentation

    - Generate OpenAPI/Swagger documentation for all endpoints
    - Document request/response schemas
    - Include example requests and responses
    - Document authentication requirements
    - Document rate limiting rules
    - _Requirements: 1.1, 1.2, 1.3_


  - [x] 16.4 Create deployment guide for cloud platforms (PRIMARY: Railway + Vercel)

    - **Railway backend deployment guide (PRIMARY)**
      - Project setup from GitHub
      - Adding PostgreSQL and Redis plugins
      - Environment variables configuration
      - Custom domain setup
      - Monitoring and logs
      - Cost optimization tips
    - **Vercel frontend deployment guide (PRIMARY)**
      - Project import from GitHub
      - Build configuration for Vite
      - Environment variables (VITE_API_URL)
      - Custom domain setup
      - Preview deployments
    - **Frontend-Backend connection guide**
      - CORS configuration for Railway backend
      - API URL configuration in Vercel
      - Testing local frontend with Railway backend
      - Environment-specific API endpoints
    - Alternative platforms (optional reference):
      - AWS deployment guide (EC2, RDS, ElastiCache)
      - DigitalOcean deployment guide (Droplets, Managed Databases)
      - Render backend deployment guide
    - _Requirements: 13.1, 13.2, 13.3_


  - [x] 16.5 Create database management guide

    - Running migrations in different environments
    - Backup and restore procedures
    - Seeding production data safely
    - Database scaling strategies
    - Connection pooling configuration
    - _Requirements: 5.1, 13.4_


  - [x] 16.6 Create monitoring and maintenance guide

    - Setting up log aggregation (ELK, Datadog, CloudWatch)
    - Configuring error tracking (Sentry)
    - Setting up uptime monitoring (UptimeRobot, Pingdom)
    - Performance monitoring setup
    - Alert configuration guide
    - Backup automation setup
    - _Requirements: 8.2, 8.3, 8.5_


  - [x] 16.7 Create security and configuration guide

    - SSL/TLS certificate setup (Let's Encrypt)
    - Environment variables security best practices
    - Secrets management (AWS Secrets Manager, Vault)
    - CORS configuration for production
    - Rate limiting configuration
    - Admin user creation and management
    - _Requirements: 6.1, 6.2, 9.1, 9.2_


  - [ ] 16.8 Create CI/CD pipeline documentation
    - GitHub Actions workflow explanation
    - Setting up deployment secrets
    - Configuring staging and production environments
    - Manual approval process for production
    - Rollback procedures
    - _Requirements: 13.1, 13.2, 13.3, 13.5_


  - [ ] 16.9 Create architecture decision records (ADRs)

    - Document why separate backend was chosen
    - Document technology stack decisions
    - Document privacy-first architecture decisions
    - Document caching strategy
    - Document testing approach
    - _Requirements: 1.1, 2.1, 11.3_

  - [ ] 16.10 Create README files
    - Root README with project overview
    - Backend README with setup instructions
    - Frontend README with development guide
    - Contributing guidelines
    - Code of conduct
    - License information
    - _Requirements: 9.1, 9.2_

  - [ ] 16.11 Create operational runbooks
    - Incident response procedures
    - Common issues and solutions
    - Performance optimization checklist
    - Scaling procedures
    - Database maintenance tasks
    - Cost optimization guide
    - _Requirements: 8.2, 8.3, 10.4_

- [ ] 17. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Verify all endpoints are working
  - Verify frontend-backend integration
  - Verify deployment pipeline
  - Verify documentation is complete and accurate
