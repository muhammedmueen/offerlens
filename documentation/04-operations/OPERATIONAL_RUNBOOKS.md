# Operational Runbooks

This document provides step-by-step procedures for common operational tasks, incident response, and troubleshooting for the OfferLens application.

## Table of Contents

- [Incident Response](#incident-response)
- [Common Issues and Solutions](#common-issues-and-solutions)
- [Performance Optimization](#performance-optimization)
- [Scaling Procedures](#scaling-procedures)
- [Database Maintenance](#database-maintenance)
- [Cost Optimization](#cost-optimization)
- [Monitoring and Alerts](#monitoring-and-alerts)

---

## Incident Response

### Incident Response Framework

**Severity Levels:**

- **P0 (Critical)**: Complete service outage, data loss
- **P1 (High)**: Major functionality broken, significant user impact
- **P2 (Medium)**: Minor functionality broken, workaround available
- **P3 (Low)**: Cosmetic issues, no user impact

### P0: Complete Service Outage

**Symptoms:**
- Health check endpoint not responding
- 100% error rate
- Users cannot access the application

**Immediate Actions:**

1. **Acknowledge the incident**
   ```bash
   # Post in incident channel
   "P0 Incident: Complete service outage. Investigating."
   ```

2. **Check service status**
   ```bash
   # Railway
   - Go to Railway dashboard
   - Check deployment status
   - Check service logs
   
   # Vercel
   - Go to Vercel dashboard
   - Check deployment status
   - Check function logs
   ```

3. **Check dependencies**
   ```bash
   # PostgreSQL
   - Railway dashboard → PostgreSQL plugin
   - Check connection status
   - Check disk space
   
   # Redis
   - Railway dashboard → Redis plugin
   - Check connection status
   - Check memory usage
   ```

4. **Quick fixes**
   ```bash
   # Option 1: Restart service
   Railway dashboard → Service → Restart
   
   # Option 2: Rollback to previous deployment
   Railway dashboard → Deployments → Select previous → Redeploy
   
   # Option 3: Scale up resources
   Railway dashboard → Settings → Increase resources
   ```

5. **Verify recovery**
   ```bash
   # Test health endpoint
   curl https://api.offerlens.com/api/v1/health
   
   # Test critical endpoints
   curl -X POST https://api.offerlens.com/api/v1/analyze \
     -H "Content-Type: application/json" \
     -d '{"offerText":"test","role":"Software Engineer","experience":"3-5 years","ctc":25,"city":"Bangalore"}'
   ```

6. **Post-incident**
   - Document timeline
   - Identify root cause
   - Create action items
   - Schedule post-mortem

**Post-Mortem Template:**

```markdown
# Incident Post-Mortem: [Date] - [Brief Description]

## Summary
Brief description of the incident.

## Timeline
- HH:MM - Incident detected
- HH:MM - Team notified
- HH:MM - Root cause identified
- HH:MM - Fix deployed
- HH:MM - Service restored

## Root Cause
Detailed explanation of what caused the incident.

## Impact
- Duration: X hours
- Users affected: ~X
- Requests failed: ~X

## Resolution
What was done to resolve the incident.

## Action Items
- [ ] Action 1 (Owner: Name, Due: Date)
- [ ] Action 2 (Owner: Name, Due: Date)

## Lessons Learned
What we learned and how to prevent this in the future.
```

### P1: Database Connection Failure

**Symptoms:**
- 500 errors on all endpoints
- Logs show "Can't reach database server"
- Health check fails

**Actions:**

1. **Check database status**
   ```bash
   # Railway dashboard
   - Go to PostgreSQL plugin
   - Check status (running/stopped)
   - Check connection count
   - Check disk space
   ```

2. **Check connection string**
   ```bash
   # Verify DATABASE_URL is set correctly
   Railway dashboard → Service → Variables → DATABASE_URL
   ```

3. **Test connection manually**
   ```bash
   # Using Railway CLI
   railway connect postgres
   \l  # List databases
   \dt # List tables
   ```

4. **Restart database** (if needed)
   ```bash
   Railway dashboard → PostgreSQL → Restart
   ```

5. **Check connection pool**
   ```bash
   # Review Prisma connection pool settings
   # In prisma/schema.prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
     connection_limit = 10  # Adjust if needed
   }
   ```

6. **Scale database** (if connection limit reached)
   ```bash
   Railway dashboard → PostgreSQL → Settings → Upgrade plan
   ```

### P1: Redis Connection Failure

**Symptoms:**
- Slow response times
- Cache misses
- Logs show "ECONNREFUSED 127.0.0.1:6379"

**Actions:**

1. **Check Redis status**
   ```bash
   Railway dashboard → Redis plugin → Status
   ```

2. **Test Redis connection**
   ```bash
   # Using Railway CLI
   railway connect redis
   PING  # Should return PONG
   INFO  # Check memory usage
   ```

3. **Check memory usage**
   ```bash
   # In Redis CLI
   INFO memory
   
   # If memory is full
   FLUSHDB  # Clear current database (use with caution)
   ```

4. **Restart Redis**
   ```bash
   Railway dashboard → Redis → Restart
   ```

5. **Verify application continues** (graceful degradation)
   ```bash
   # Application should work without cache, just slower
   # Check logs for cache warnings
   ```

### P1: High Error Rate

**Symptoms:**
- Error rate > 5%
- Multiple 500 errors in logs
- Users reporting issues

**Actions:**

1. **Check error logs**
   ```bash
   # Railway
   Railway dashboard → Service → Logs → Filter by "error"
   
   # Look for patterns
   - Specific endpoint failing?
   - Specific error message?
   - Started at specific time?
   ```

2. **Check recent deployments**
   ```bash
   Railway dashboard → Deployments
   # Was there a recent deployment?
   # Rollback if needed
   ```

3. **Check external services**
   ```bash
   # If using external APIs
   - Check API status pages
   - Check rate limits
   - Check API keys
   ```

4. **Check resource usage**
   ```bash
   Railway dashboard → Metrics
   - CPU usage
   - Memory usage
   - Network usage
   ```

5. **Scale if needed**
   ```bash
   Railway dashboard → Settings → Scale
   ```

---

## Common Issues and Solutions

### Issue: Slow API Response Times

**Symptoms:**
- Response times > 2 seconds
- Users complaining about slowness
- Timeout errors

**Diagnosis:**

1. **Check metrics**
   ```bash
   Railway dashboard → Metrics → Response Time
   ```

2. **Check database queries**
   ```bash
   # Enable query logging
   # In prisma/schema.prisma
   generator client {
     provider = "prisma-client-js"
     log      = ["query", "info", "warn", "error"]
   }
   ```

3. **Check cache hit rate**
   ```bash
   # In Redis CLI
   INFO stats
   # Look for keyspace_hits vs keyspace_misses
   ```

**Solutions:**

1. **Add database indexes**
   ```sql
   -- Example: Add index for salary lookups
   CREATE INDEX idx_salary_lookup 
   ON salary_benchmarks(role, experience_level, city);
   ```

2. **Increase cache TTL**
   ```typescript
   // Increase from 1 hour to 4 hours
   await cacheService.set(key, data, 14400);
   ```

3. **Optimize queries**
   ```typescript
   // Use select to fetch only needed fields
   const data = await prisma.salaryBenchmark.findMany({
     select: {
       role: true,
       avgSalary: true,
       // Don't fetch unnecessary fields
     },
   });
   ```

4. **Scale resources**
   ```bash
   Railway dashboard → Settings → Upgrade plan
   ```

### Issue: High Memory Usage

**Symptoms:**
- Memory usage > 90%
- Application crashes
- Out of memory errors

**Diagnosis:**

1. **Check memory metrics**
   ```bash
   Railway dashboard → Metrics → Memory
   ```

2. **Check for memory leaks**
   ```bash
   # Add memory profiling
   node --inspect dist/index.js
   # Use Chrome DevTools to profile
   ```

**Solutions:**

1. **Increase memory limit**
   ```bash
   Railway dashboard → Settings → Increase memory
   ```

2. **Fix memory leaks**
   ```typescript
   // Ensure event listeners are removed
   // Close database connections
   // Clear intervals/timeouts
   ```

3. **Optimize data structures**
   ```typescript
   // Don't load all data into memory
   // Use pagination
   const data = await prisma.salaryBenchmark.findMany({
     take: 100,
     skip: page * 100,
   });
   ```

### Issue: CORS Errors

**Symptoms:**
- Frontend can't connect to backend
- Browser console shows CORS error
- "Access-Control-Allow-Origin" error

**Diagnosis:**

1. **Check CORS configuration**
   ```bash
   Railway dashboard → Service → Variables → CORS_ORIGIN
   ```

2. **Check frontend URL**
   ```bash
   Vercel dashboard → Project → Domains
   ```

**Solutions:**

1. **Update CORS_ORIGIN**
   ```bash
   # In Railway
   CORS_ORIGIN=https://your-frontend.vercel.app
   
   # For multiple origins
   CORS_ORIGIN=https://app.offerlens.com,https://staging.offerlens.com
   ```

2. **Restart backend**
   ```bash
   Railway dashboard → Service → Restart
   ```

3. **Verify in code**
   ```typescript
   // src/app.ts
   app.use(cors({
     origin: process.env.CORS_ORIGIN?.split(','),
     credentials: true,
   }));
   ```

### Issue: Rate Limiting Too Aggressive

**Symptoms:**
- Users getting 429 errors
- Legitimate users blocked
- Complaints about rate limits

**Diagnosis:**

1. **Check rate limit settings**
   ```bash
   Railway dashboard → Variables
   RATE_LIMIT_WINDOW_MS=60000
   RATE_LIMIT_MAX_REQUESTS=100
   ```

2. **Check Redis for rate limit keys**
   ```bash
   # In Redis CLI
   KEYS rate_limit:*
   TTL rate_limit:192.168.1.1
   ```

**Solutions:**

1. **Increase rate limits**
   ```bash
   # In Railway variables
   RATE_LIMIT_MAX_REQUESTS=200  # Increase from 100
   ```

2. **Adjust time window**
   ```bash
   RATE_LIMIT_WINDOW_MS=120000  # 2 minutes instead of 1
   ```

3. **Whitelist IPs** (if needed)
   ```typescript
   // src/middleware/rateLimiter.ts
   const whitelist = ['1.2.3.4', '5.6.7.8'];
   if (whitelist.includes(req.ip)) {
     return next();
   }
   ```

### Issue: Failed Migrations

**Symptoms:**
- Deployment fails
- "Migration failed" error
- Database schema out of sync

**Diagnosis:**

1. **Check migration logs**
   ```bash
   Railway dashboard → Deployments → Failed deployment → Logs
   ```

2. **Check migration status**
   ```bash
   # Using Railway CLI
   railway run npx prisma migrate status
   ```

**Solutions:**

1. **Resolve migration manually**
   ```bash
   # Mark migration as applied (if already applied)
   railway run npx prisma migrate resolve --applied "migration_name"
   
   # Or rollback
   railway run npx prisma migrate resolve --rolled-back "migration_name"
   ```

2. **Reset database** (⚠️ DESTRUCTIVE - only for dev/staging)
   ```bash
   railway run npx prisma migrate reset
   ```

3. **Create new migration**
   ```bash
   # Fix the issue locally
   npx prisma migrate dev --name fix_migration_issue
   git push
   ```

---

## Performance Optimization

### Performance Optimization Checklist

#### Database Optimization

- [ ] **Add indexes for frequently queried fields**
  ```sql
  CREATE INDEX idx_salary_lookup ON salary_benchmarks(role, experience_level, city);
  CREATE INDEX idx_feature_status ON feature_requests(status, created_at DESC);
  CREATE INDEX idx_active_rules ON red_flag_rules(active);
  ```

- [ ] **Use connection pooling**
  ```typescript
  // prisma/schema.prisma
  datasource db {
    provider = "postgresql"
    url      = env("DATABASE_URL")
    connection_limit = 10
  }
  ```

- [ ] **Optimize queries**
  ```typescript
  // Use select to fetch only needed fields
  // Use include instead of multiple queries
  // Use pagination for large datasets
  ```

#### Caching Optimization

- [ ] **Increase cache TTL for static data**
  ```typescript
  // Salary benchmarks: 4 hours
  await cacheService.set(key, data, 14400);
  
  // Metadata: 24 hours
  await cacheService.set(key, data, 86400);
  ```

- [ ] **Implement cache warming**
  ```typescript
  // On application startup
  async function warmCache() {
    const roles = await prisma.salaryBenchmark.findMany({
      distinct: ['role'],
    });
    for (const role of roles) {
      await cacheService.set(`roles:${role}`, role, 86400);
    }
  }
  ```

- [ ] **Monitor cache hit rate**
  ```bash
  # Target: > 80% hit rate
  # In Redis CLI
  INFO stats
  ```

#### API Optimization

- [ ] **Enable compression**
  ```typescript
  import compression from 'compression';
  app.use(compression());
  ```

- [ ] **Implement response caching**
  ```typescript
  // Cache GET requests
  app.get('/api/v1/roles', cacheMiddleware(3600), getRoles);
  ```

- [ ] **Optimize payload size**
  ```typescript
  // Only return necessary fields
  // Use pagination
  // Compress responses
  ```

#### Frontend Optimization

- [ ] **Enable code splitting**
  ```typescript
  // Lazy load routes
  const Results = lazy(() => import('./pages/Results'));
  ```

- [ ] **Optimize images**
  ```html
  <!-- Use WebP format -->
  <img src="image.webp" alt="..." />
  
  <!-- Lazy load images -->
  <img loading="lazy" src="..." alt="..." />
  ```

- [ ] **Minimize bundle size**
  ```bash
  npm run build
  npx vite-bundle-visualizer
  ```

### Performance Monitoring

**Key Metrics to Track:**

1. **Response Time**
   - Target: p95 < 2 seconds
   - Monitor: Railway metrics

2. **Error Rate**
   - Target: < 1%
   - Monitor: Application logs

3. **Cache Hit Rate**
   - Target: > 80%
   - Monitor: Redis INFO stats

4. **Database Query Time**
   - Target: < 100ms
   - Monitor: Prisma query logs

5. **Memory Usage**
   - Target: < 80%
   - Monitor: Railway metrics

---

## Scaling Procedures

### Horizontal Scaling (Add More Instances)

**When to Scale:**
- CPU usage consistently > 80%
- Response times increasing
- Handling more traffic

**Railway Scaling:**

1. **Upgrade plan**
   ```bash
   Railway dashboard → Settings → Upgrade to Pro
   ```

2. **Enable auto-scaling** (Pro plan)
   ```bash
   Railway dashboard → Settings → Auto-scaling → Enable
   ```

3. **Configure scaling rules**
   ```bash
   Min instances: 2
   Max instances: 10
   CPU threshold: 80%
   ```

**Considerations:**
- Ensure stateless application design
- Use Redis for shared state
- Database connection pooling

### Vertical Scaling (Increase Resources)

**When to Scale:**
- Memory usage consistently > 80%
- CPU-intensive operations
- Large data processing

**Railway Scaling:**

1. **Increase memory**
   ```bash
   Railway dashboard → Settings → Memory → Increase
   ```

2. **Increase CPU**
   ```bash
   Railway dashboard → Settings → CPU → Increase
   ```

### Database Scaling

**Read Replicas:**

1. **Create read replica**
   ```bash
   Railway dashboard → PostgreSQL → Add Read Replica
   ```

2. **Configure application**
   ```typescript
   // Use read replica for read operations
   const readClient = new PrismaClient({
     datasources: {
       db: {
         url: process.env.DATABASE_READ_URL,
       },
     },
   });
   ```

**Connection Pooling:**

```typescript
// Increase connection pool size
datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
  connection_limit = 20  // Increase from 10
}
```

### Cache Scaling

**Increase Redis Memory:**

```bash
Railway dashboard → Redis → Settings → Increase memory
```

**Redis Clustering** (for very high scale):

```bash
# Requires Pro plan
Railway dashboard → Redis → Enable clustering
```

---

## Database Maintenance

### Daily Maintenance

**Automated Backups:**

```bash
# Railway provides automatic daily backups
Railway dashboard → PostgreSQL → Backups
```

**Manual Backup:**

```bash
# Using Railway CLI
railway connect postgres
pg_dump offerlens_prod > backup_$(date +%Y%m%d).sql
```

### Weekly Maintenance

**Vacuum Database:**

```sql
-- Reclaim storage and update statistics
VACUUM ANALYZE;
```

**Check Index Usage:**

```sql
-- Find unused indexes
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan
FROM pg_stat_user_indexes
WHERE idx_scan = 0
ORDER BY schemaname, tablename;
```

**Check Table Sizes:**

```sql
-- Find largest tables
SELECT
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Monthly Maintenance

**Review Slow Queries:**

```sql
-- Enable slow query logging
ALTER DATABASE offerlens_prod SET log_min_duration_statement = 1000;

-- Review logs
Railway dashboard → PostgreSQL → Logs
```

**Update Statistics:**

```sql
ANALYZE;
```

**Check for Bloat:**

```sql
-- Check table bloat
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Database Migration Best Practices

1. **Test migrations locally first**
   ```bash
   npm run prisma:migrate:dev
   ```

2. **Backup before migration**
   ```bash
   railway connect postgres
   pg_dump offerlens_prod > pre_migration_backup.sql
   ```

3. **Run migration**
   ```bash
   git push origin main  # Railway auto-runs migrations
   ```

4. **Verify migration**
   ```bash
   railway run npx prisma migrate status
   ```

5. **Rollback if needed**
   ```bash
   # Restore from backup
   railway connect postgres
   psql offerlens_prod < pre_migration_backup.sql
   ```

---

## Cost Optimization

### Cost Optimization Checklist

#### Infrastructure Costs

- [ ] **Right-size resources**
  - Monitor actual usage
  - Scale down if over-provisioned
  - Use auto-scaling

- [ ] **Optimize database**
  - Delete old analytics events
  - Archive unused data
  - Optimize queries to reduce CPU

- [ ] **Optimize caching**
  - Increase cache TTL
  - Reduce cache misses
  - Monitor memory usage

- [ ] **Use CDN for static assets**
  - Vercel provides CDN automatically
  - Reduces bandwidth costs

#### Application Costs

- [ ] **Reduce API calls**
  - Batch requests
  - Cache responses
  - Debounce user inputs

- [ ] **Optimize images**
  - Use WebP format
  - Compress images
  - Lazy load images

- [ ] **Minimize bundle size**
  - Remove unused dependencies
  - Code splitting
  - Tree shaking

### Cost Monitoring

**Railway Costs:**

```bash
Railway dashboard → Billing → Usage
```

**Typical Costs (as of 2024):**
- Hobby plan: $5/month
- Pro plan: $20/month + usage
- PostgreSQL: $5-20/month
- Redis: $5-15/month

**Cost Alerts:**

```bash
Railway dashboard → Billing → Set spending limit
```

### Cost Reduction Strategies

1. **Use staging environment sparingly**
   - Shut down when not in use
   - Use smaller resources

2. **Optimize database queries**
   - Reduce query count
   - Use indexes
   - Cache results

3. **Implement rate limiting**
   - Prevent abuse
   - Reduce unnecessary load

4. **Monitor and alert**
   - Set up cost alerts
   - Review usage monthly
   - Identify optimization opportunities

---

## Monitoring and Alerts

### Key Metrics to Monitor

1. **Application Health**
   - Uptime
   - Response time
   - Error rate

2. **Infrastructure Health**
   - CPU usage
   - Memory usage
   - Disk space

3. **Database Health**
   - Connection count
   - Query performance
   - Disk usage

4. **Cache Health**
   - Hit rate
   - Memory usage
   - Eviction rate

### Setting Up Alerts

**Railway Alerts:**

```bash
Railway dashboard → Settings → Notifications
- Enable email notifications
- Enable Slack notifications (if available)
```

**Uptime Monitoring:**

1. **Sign up for UptimeRobot** (free tier)
2. **Add monitor**
   - URL: https://api.offerlens.com/api/v1/health
   - Interval: 5 minutes
   - Alert contacts: your-email@example.com

3. **Configure alerts**
   - Email on downtime
   - SMS on critical issues (optional)

**Error Tracking (Sentry):**

1. **Sign up for Sentry** (free tier)
2. **Install Sentry**
   ```bash
   npm install @sentry/node
   ```

3. **Configure Sentry**
   ```typescript
   import * as Sentry from '@sentry/node';
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
   });
   ```

4. **Set up alerts**
   - Email on new errors
   - Slack notifications
   - Issue assignment

### Alert Response Procedures

**Downtime Alert:**
1. Check Railway dashboard
2. Check deployment logs
3. Restart service if needed
4. Escalate if not resolved in 5 minutes

**High Error Rate Alert:**
1. Check error logs
2. Identify error pattern
3. Rollback if recent deployment
4. Fix and redeploy

**High Resource Usage Alert:**
1. Check metrics
2. Identify cause
3. Scale resources if needed
4. Optimize code if persistent

---

## Emergency Contacts

**On-Call Rotation:**
- Primary: [Name] - [Phone] - [Email]
- Secondary: [Name] - [Phone] - [Email]
- Escalation: [Name] - [Phone] - [Email]

**External Support:**
- Railway Support: support@railway.app
- Vercel Support: support@vercel.com
- Database Expert: [Contact]

---

## Appendix

### Useful Commands

**Railway CLI:**
```bash
# Connect to database
railway connect postgres

# Connect to Redis
railway connect redis

# Run command in production
railway run <command>

# View logs
railway logs

# Restart service
railway restart
```

**Database Commands:**
```sql
-- Check active connections
SELECT count(*) FROM pg_stat_activity;

-- Kill long-running queries
SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE state = 'active' AND query_start < now() - interval '5 minutes';

-- Check database size
SELECT pg_size_pretty(pg_database_size('offerlens_prod'));
```

**Redis Commands:**
```bash
# Check memory usage
INFO memory

# Check keyspace
INFO keyspace

# Clear cache (use with caution)
FLUSHDB

# Get all keys matching pattern
KEYS rate_limit:*
```

---

**Last Updated**: December 12, 2024  
**Maintained By**: OfferLens Operations Team
