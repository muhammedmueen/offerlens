# Database Management Guide

Comprehensive guide for managing the OfferLens PostgreSQL database across different environments.

## Table of Contents

- [Overview](#overview)
- [Database Schema](#database-schema)
- [Running Migrations](#running-migrations)
- [Backup and Restore](#backup-and-restore)
- [Seeding Data](#seeding-data)
- [Database Scaling](#database-scaling)
- [Connection Pooling](#connection-pooling)
- [Maintenance Tasks](#maintenance-tasks)
- [Troubleshooting](#troubleshooting)

## Overview

OfferLens uses:
- **PostgreSQL 15+** for persistent data storage
- **Prisma ORM** for database access and migrations
- **Connection pooling** for optimal performance
- **Automated backups** on Railway

### Database Structure

```
offerlens_db
├── salary_benchmarks      # Market salary data
├── red_flag_rules         # Detection rules
├── feature_requests       # User feedback
├── feature_request_votes  # Vote tracking
├── analytics_events       # Usage metrics
└── admin_users           # Admin authentication
```

## Database Schema

### Tables Overview

#### salary_benchmarks
Stores market salary data by role, experience, and location.

```sql
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

CREATE INDEX idx_salary_lookup 
  ON salary_benchmarks(role, experience_level, city);
```

**Purpose:** Fast salary lookups for offer analysis  
**Size:** ~660 records (12 roles × 5 levels × 11 cities)  
**Update Frequency:** Quarterly

#### red_flag_rules
Pattern matching rules for detecting problematic clauses.

```sql
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
```

**Purpose:** Red flag detection in offer letters  
**Size:** ~8-20 records  
**Update Frequency:** As needed

#### feature_requests
User-submitted feature requests and feedback.

```sql
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

CREATE INDEX idx_feature_status 
  ON feature_requests(status, created_at DESC);
```

**Purpose:** Feature request management  
**Size:** Growing over time  
**Update Frequency:** Continuous

#### feature_request_votes
Tracks votes by IP to prevent duplicates.

```sql
CREATE TABLE feature_request_votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_request_id UUID REFERENCES feature_requests(id) ON DELETE CASCADE,
  ip_address VARCHAR(45) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(feature_request_id, ip_address)
);
```

**Purpose:** Vote tracking and duplicate prevention  
**Size:** Growing over time  
**Update Frequency:** Continuous

#### analytics_events
Anonymized usage tracking.

```sql
CREATE TABLE analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type VARCHAR(50) NOT NULL,
  metadata JSONB,
  ip_address_hash VARCHAR(64),
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_analytics_type_date 
  ON analytics_events(event_type, created_at DESC);
```

**Purpose:** Usage analytics and metrics  
**Size:** Growing rapidly  
**Update Frequency:** Continuous  
**Retention:** Consider archiving old data

#### admin_users
Admin authentication credentials.

```sql
CREATE TABLE admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(100) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'admin',
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);
```

**Purpose:** Admin authentication  
**Size:** Small (< 10 records)  
**Update Frequency:** Rare

## Running Migrations

### Local Development

**Apply all pending migrations:**
```bash
cd offerlens-backend
npm run prisma:migrate
```

**Create a new migration:**
```bash
# After editing prisma/schema.prisma
npx prisma migrate dev --name description_of_changes
```

**Example:**
```bash
# Add new column to salary_benchmarks
npx prisma migrate dev --name add_currency_to_salary_benchmarks
```

**Reset database (⚠️ deletes all data):**
```bash
npm run db:reset
```

### Staging Environment

**Deploy migrations:**
```bash
# Using Railway CLI
railway link --environment staging
railway run npm run prisma:migrate:deploy
```

**Verify migration status:**
```bash
railway run npx prisma migrate status
```

### Production Environment

**Deploy migrations (Railway):**

Railway automatically runs migrations on deploy if configured:

```json
// package.json
{
  "scripts": {
    "start": "npm run migrate && node dist/index.js",
    "migrate": "npx prisma migrate deploy"
  }
}
```

**Manual migration:**
```bash
# Using Railway CLI
railway link --environment production
railway run npm run prisma:migrate:deploy
```

**Best Practices:**
1. Test migrations on staging first
2. Backup database before production migration
3. Run migrations during low-traffic periods
4. Monitor logs during migration
5. Have rollback plan ready

### Migration Rollback

**If migration fails:**

```bash
# Mark migration as rolled back
npx prisma migrate resolve --rolled-back "migration_name"

# Or mark as applied (if partially applied)
npx prisma migrate resolve --applied "migration_name"
```

**Restore from backup:**
```bash
# See Backup and Restore section
```

## Backup and Restore

### Automated Backups (Railway)

Railway automatically backs up PostgreSQL databases:
- **Frequency:** Daily
- **Retention:** 7 days (Hobby), 30 days (Pro)
- **Location:** Railway infrastructure
- **Restore:** Via Railway dashboard

**To restore from Railway backup:**
1. Go to Railway dashboard
2. Click on PostgreSQL service
3. Go to "Backups" tab
4. Select backup to restore
5. Click "Restore"

### Manual Backups

#### Local Development

**Backup:**
```bash
# Using Docker
docker-compose exec postgres pg_dump -U offerlens offerlens_dev > backup.sql

# Or directly
pg_dump -U offerlens -h localhost offerlens_dev > backup.sql

# Compressed backup
pg_dump -U offerlens -h localhost offerlens_dev | gzip > backup.sql.gz
```

**Restore:**
```bash
# Using Docker
docker-compose exec -T postgres psql -U offerlens offerlens_dev < backup.sql

# Or directly
psql -U offerlens -h localhost offerlens_dev < backup.sql

# From compressed backup
gunzip -c backup.sql.gz | psql -U offerlens -h localhost offerlens_dev
```

#### Production (Railway)

**Backup:**
```bash
# Using Railway CLI
railway connect postgres

# In psql prompt:
\! pg_dump $DATABASE_URL > backup.sql

# Or from local machine:
pg_dump $(railway variables get DATABASE_URL) > backup.sql
```

**Restore:**
```bash
# ⚠️ This will overwrite existing data!
psql $(railway variables get DATABASE_URL) < backup.sql
```

### Backup Strategy

**Recommended Schedule:**

| Environment | Frequency | Retention | Method |
|-------------|-----------|-----------|--------|
| Development | Manual | As needed | Local pg_dump |
| Staging | Daily | 7 days | Railway auto |
| Production | Daily | 30 days | Railway auto |
| Production | Weekly | 90 days | Manual export |

**Weekly Production Backup Script:**

```bash
#!/bin/bash
# backup-production.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="./backups"
BACKUP_FILE="$BACKUP_DIR/offerlens_prod_$DATE.sql.gz"

# Create backup directory
mkdir -p $BACKUP_DIR

# Backup database
railway link --environment production
pg_dump $(railway variables get DATABASE_URL) | gzip > $BACKUP_FILE

# Upload to S3 (optional)
aws s3 cp $BACKUP_FILE s3://offerlens-backups/

# Keep only last 12 backups locally
ls -t $BACKUP_DIR/*.sql.gz | tail -n +13 | xargs rm -f

echo "Backup completed: $BACKUP_FILE"
```

**Schedule with cron:**
```bash
# Run every Sunday at 2 AM
0 2 * * 0 /path/to/backup-production.sh
```

## Seeding Data

### Initial Seed

**Seed all data:**
```bash
npm run prisma:seed
```

This seeds:
- 660 salary benchmarks
- 8 red flag rules
- 1 default admin user

### Custom Seed Scripts

**Seed specific data:**

```typescript
// prisma/seed-custom.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  // Seed additional salary data
  await prisma.salaryBenchmark.createMany({
    data: [
      {
        role: 'DevOps Engineer',
        experienceLevel: '5-8 years',
        city: 'Bangalore',
        minSalary: 25,
        avgSalary: 32,
        maxSalary: 40,
        effectiveDate: new Date('2024-01-01'),
      },
      // More data...
    ],
  });

  console.log('Custom seed completed');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

**Run custom seed:**
```bash
npx tsx prisma/seed-custom.ts
```

### Seeding Production

**⚠️ Important:** Only seed production once during initial setup.

```bash
# Using Railway CLI
railway link --environment production
railway run npm run prisma:seed
```

**Verify seed:**
```bash
railway run npx prisma studio
```

## Database Scaling

### Vertical Scaling

**Railway:**
- Hobby: 256MB RAM, 1 vCPU
- Pro: Configurable (up to 32GB RAM, 8 vCPU)

**To scale:**
1. Go to Railway dashboard
2. Click on PostgreSQL service
3. Go to "Settings" → "Resources"
4. Adjust RAM and CPU
5. Railway restarts database

**When to scale:**
- CPU usage consistently > 70%
- Memory usage consistently > 80%
- Query response times increasing
- Connection pool exhaustion

### Horizontal Scaling (Read Replicas)

**Not available on Railway Hobby plan.**

**For Pro plan:**
1. Contact Railway support
2. Request read replica
3. Configure application to use replica for reads

**Application changes:**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

// Write database
export const prismaWrite = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
});

// Read replica
export const prismaRead = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_READ_URL,
    },
  },
});

// Use write for mutations
await prismaWrite.salaryBenchmark.create({ data });

// Use read for queries
const benchmarks = await prismaRead.salaryBenchmark.findMany();
```

### Query Optimization

**Identify slow queries:**

```sql
-- Enable query logging (development only)
ALTER DATABASE offerlens_dev SET log_statement = 'all';
ALTER DATABASE offerlens_dev SET log_duration = on;
ALTER DATABASE offerlens_dev SET log_min_duration_statement = 100;

-- View slow queries
SELECT query, calls, total_time, mean_time
FROM pg_stat_statements
ORDER BY mean_time DESC
LIMIT 10;
```

**Optimize queries:**

1. **Add indexes:**
```sql
-- Check missing indexes
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100
  AND correlation < 0.1;

-- Add index
CREATE INDEX idx_name ON table_name(column_name);
```

2. **Use EXPLAIN ANALYZE:**
```sql
EXPLAIN ANALYZE
SELECT * FROM salary_benchmarks
WHERE role = 'Software Engineer'
  AND experience_level = '3-5 years'
  AND city = 'Bangalore';
```

3. **Optimize Prisma queries:**
```typescript
// Bad: N+1 query
const requests = await prisma.featureRequest.findMany();
for (const request of requests) {
  const votes = await prisma.featureRequestVote.count({
    where: { featureRequestId: request.id },
  });
}

// Good: Single query with aggregation
const requests = await prisma.featureRequest.findMany({
  include: {
    _count: {
      select: { votes: true },
    },
  },
});
```

## Connection Pooling

### Prisma Connection Pool

**Configuration:**

```typescript
// src/lib/prisma.ts
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

export default prisma;
```

**Connection pool settings (via DATABASE_URL):**

```env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20"
```

**Parameters:**
- `connection_limit`: Max connections (default: 10)
- `pool_timeout`: Timeout in seconds (default: 10)

**Recommended settings:**

| Environment | connection_limit | pool_timeout |
|-------------|------------------|--------------|
| Development | 5 | 10 |
| Staging | 10 | 20 |
| Production | 20 | 30 |

### PostgreSQL Connection Limits

**Check current connections:**

```sql
SELECT count(*) FROM pg_stat_activity;
```

**Check max connections:**

```sql
SHOW max_connections;
```

**Railway limits:**
- Hobby: 20 connections
- Pro: 100 connections

**If hitting limits:**
1. Increase `connection_limit` in DATABASE_URL
2. Implement connection pooling (PgBouncer)
3. Optimize query patterns
4. Scale database

## Maintenance Tasks

### Daily Tasks

**Monitor database health:**

```bash
# Check database size
railway run psql -c "SELECT pg_size_pretty(pg_database_size('railway'));"

# Check table sizes
railway run psql -c "
  SELECT schemaname, tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
  FROM pg_tables
  WHERE schemaname = 'public'
  ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
"

# Check connection count
railway run psql -c "SELECT count(*) FROM pg_stat_activity;"
```

### Weekly Tasks

**Vacuum and analyze:**

```sql
-- Vacuum all tables
VACUUM ANALYZE;

-- Vacuum specific table
VACUUM ANALYZE salary_benchmarks;
```

**Check for bloat:**

```sql
SELECT schemaname, tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS total_size,
  pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) AS table_size,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename) - 
    pg_relation_size(schemaname||'.'||tablename)) AS index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;
```

### Monthly Tasks

**Update statistics:**

```sql
ANALYZE;
```

**Reindex:**

```sql
-- Reindex all tables
REINDEX DATABASE railway;

-- Reindex specific table
REINDEX TABLE salary_benchmarks;
```

**Archive old analytics:**

```sql
-- Archive events older than 90 days
CREATE TABLE analytics_events_archive AS
SELECT * FROM analytics_events
WHERE created_at < NOW() - INTERVAL '90 days';

-- Delete archived events
DELETE FROM analytics_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

### Quarterly Tasks

**Review and optimize:**
1. Review slow query log
2. Add missing indexes
3. Remove unused indexes
4. Update salary benchmarks
5. Review red flag rules
6. Clean up old feature requests

## Troubleshooting

### Connection Issues

**Error:** `ECONNREFUSED` or `Connection timeout`

**Solutions:**

1. **Check database is running:**
```bash
railway status
```

2. **Verify DATABASE_URL:**
```bash
railway variables get DATABASE_URL
```

3. **Test connection:**
```bash
railway run psql -c "SELECT 1;"
```

4. **Check connection pool:**
```typescript
// Add logging
const prisma = new PrismaClient({
  log: ['query', 'error', 'warn'],
});
```

### Migration Issues

**Error:** `Migration failed to apply`

**Solutions:**

1. **Check migration status:**
```bash
npx prisma migrate status
```

2. **Resolve failed migration:**
```bash
# Mark as rolled back
npx prisma migrate resolve --rolled-back "migration_name"

# Or mark as applied
npx prisma migrate resolve --applied "migration_name"
```

3. **Reset and reapply:**
```bash
# Development only!
npm run db:reset
```

### Performance Issues

**Symptom:** Slow queries

**Solutions:**

1. **Enable query logging:**
```typescript
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
  ],
});

prisma.$on('query', (e) => {
  console.log('Query: ' + e.query);
  console.log('Duration: ' + e.duration + 'ms');
});
```

2. **Check for missing indexes:**
```sql
SELECT schemaname, tablename, attname
FROM pg_stats
WHERE schemaname = 'public'
  AND n_distinct > 100;
```

3. **Analyze query plan:**
```sql
EXPLAIN ANALYZE <your-query>;
```

### Disk Space Issues

**Error:** `Disk full` or `No space left on device`

**Solutions:**

1. **Check disk usage:**
```bash
railway run df -h
```

2. **Check database size:**
```sql
SELECT pg_size_pretty(pg_database_size('railway'));
```

3. **Archive old data:**
```sql
-- Archive old analytics events
DELETE FROM analytics_events
WHERE created_at < NOW() - INTERVAL '90 days';
```

4. **Vacuum:**
```sql
VACUUM FULL;
```

5. **Upgrade plan** (if needed)

### Data Corruption

**Error:** `Invalid page header` or `Corrupted index`

**Solutions:**

1. **Restore from backup:**
```bash
# See Backup and Restore section
```

2. **Reindex:**
```sql
REINDEX DATABASE railway;
```

3. **Contact Railway support**

## Best Practices

### Development

- ✅ Use migrations for all schema changes
- ✅ Test migrations on staging first
- ✅ Keep seed data up to date
- ✅ Use Prisma Studio for data inspection
- ✅ Never commit `.env` files
- ✅ Document schema changes

### Production

- ✅ Always backup before migrations
- ✅ Run migrations during low-traffic periods
- ✅ Monitor migration logs
- ✅ Have rollback plan ready
- ✅ Use connection pooling
- ✅ Monitor database metrics
- ✅ Archive old data regularly
- ✅ Keep backups for 90+ days

### Security

- ✅ Use strong database passwords
- ✅ Restrict database access by IP
- ✅ Use SSL connections in production
- ✅ Never expose DATABASE_URL
- ✅ Rotate credentials regularly
- ✅ Audit database access logs
- ✅ Encrypt backups

## Resources

- **Prisma Documentation**: [prisma.io/docs](https://www.prisma.io/docs)
- **PostgreSQL Documentation**: [postgresql.org/docs](https://www.postgresql.org/docs/)
- **Railway PostgreSQL**: [docs.railway.app/databases/postgresql](https://docs.railway.app/databases/postgresql)
- **Database Design**: See `offerlens-backend/DATABASE.md`

## Getting Help

If you encounter database issues:

1. Check this guide first
2. Review Prisma documentation
3. Check Railway status page
4. Review database logs
5. Ask in Railway Discord
6. Create GitHub issue

---

**Last Updated**: December 12, 2024  
**Maintained By**: OfferLens Team
