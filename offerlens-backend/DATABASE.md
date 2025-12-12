# Database Setup Guide

This guide covers the database setup for the OfferLens backend application.

## Overview

The application uses:
- **PostgreSQL 15+** for persistent data storage
- **Prisma ORM** for database access and migrations
- **Redis 7+** for caching and rate limiting

## Quick Start (Local Development)

### 1. Start Database Services

```bash
# Start PostgreSQL and Redis using Docker Compose
docker-compose up -d postgres redis

# Or initialize with the helper script
npm run db:init
```

### 2. Generate Prisma Client

```bash
npm run prisma:generate
```

### 3. Run Migrations

```bash
# Apply all migrations
npm run prisma:migrate

# Or for production deployment
npm run prisma:migrate:deploy
```

### 4. Seed Initial Data

```bash
npm run prisma:seed
```

This will populate the database with:
- Salary benchmarks for 12 roles across 11 cities
- 8 red flag detection rules
- Default admin user (username: `admin`, password: `admin123`)

## Database Schema

### Tables

#### `salary_benchmarks`
Stores market salary data by role, experience level, and city.

- `id`: UUID primary key
- `role`: Job role (e.g., "Software Engineer")
- `experience_level`: Experience range (e.g., "3-5 years")
- `city`: City name (e.g., "Bangalore")
- `min_salary`, `avg_salary`, `max_salary`: Salary range in LPA
- `effective_date`: Date when this data became effective
- `created_at`, `updated_at`: Timestamps

**Indexes:**
- Composite index on `(role, experience_level, city)` for fast lookups
- Unique constraint on `(role, experience_level, city, effective_date)`

#### `red_flag_rules`
Pattern matching rules for detecting problematic clauses in offer letters.

- `id`: UUID primary key
- `rule_id`: Unique identifier (e.g., "training-bond")
- `severity`: "high", "medium", or "low"
- `title`: Display title
- `description`: Detailed explanation
- `keywords`: Array of keywords to match
- `active`: Boolean flag to enable/disable rules
- `created_at`, `updated_at`: Timestamps

**Indexes:**
- Index on `active` for filtering active rules

#### `feature_requests`
User-submitted feature requests and feedback.

- `id`: UUID primary key
- `type`: "role", "feature", or "issue"
- `title`: Request title
- `description`: Detailed description
- `user_email`: Optional user email
- `status`: "submitted", "under_review", "planned", "in_progress", "completed", "declined"
- `votes`: Vote count
- `admin_note`: Optional admin response
- `created_at`, `updated_at`: Timestamps

**Indexes:**
- Composite index on `(status, created_at DESC)` for filtering and sorting

#### `feature_request_votes`
Tracks votes by IP address to prevent duplicate voting.

- `id`: UUID primary key
- `feature_request_id`: Foreign key to feature_requests
- `ip_address`: Voter's IP address
- `created_at`: Timestamp

**Constraints:**
- Unique constraint on `(feature_request_id, ip_address)`
- Cascade delete when feature request is deleted

#### `analytics_events`
Anonymized usage tracking and metrics.

- `id`: UUID primary key
- `event_type`: Event category (e.g., "analysis_completed")
- `metadata`: JSON field for event-specific data
- `ip_address_hash`: Hashed IP for privacy
- `created_at`: Timestamp

**Indexes:**
- Composite index on `(event_type, created_at DESC)` for analytics queries

#### `admin_users`
Admin authentication credentials.

- `id`: UUID primary key
- `username`: Unique username
- `password_hash`: Bcrypt hashed password
- `role`: "admin" or "super_admin"
- `created_at`: Timestamp
- `last_login`: Last login timestamp

**Indexes:**
- Unique constraint on `username`

## Environment Configuration

### Local Development

```env
DATABASE_URL=postgresql://offerlens:offerlens_dev_password@localhost:5432/offerlens_dev
```

### Railway (Production)

Railway automatically provides `DATABASE_URL` when you add the PostgreSQL plugin:

```env
DATABASE_URL=${DATABASE_URL}  # Provided by Railway
```

### Other Platforms

For AWS RDS, DigitalOcean, or other platforms:

```env
DATABASE_URL=postgresql://username:password@host:5432/database_name
```

## Common Operations

### View Database in Prisma Studio

```bash
npm run prisma:studio
```

Opens a web interface at `http://localhost:5555` to browse and edit data.

### Reset Database (Development Only)

```bash
# ⚠️ This will delete all data!
npm run db:reset
```

### Create a New Migration

```bash
# After modifying prisma/schema.prisma
npx prisma migrate dev --name description_of_changes
```

### Check Migration Status

```bash
npx prisma migrate status
```

### Generate Prisma Client After Schema Changes

```bash
npm run prisma:generate
```

## Data Migration from Frontend

The seed script (`prisma/seed.ts`) migrates existing data from the frontend:

### Salary Data
- 12 job roles (Software Engineer, Data Scientist, Product Manager, etc.)
- 5 experience levels (0-1 years, 1-3 years, 3-5 years, 5-8 years, 8+ years)
- 11 cities with multipliers (Bangalore, Mumbai, Delhi NCR, etc.)
- Total: 660 salary benchmark records

### Red Flag Rules
- 8 detection rules across 3 severity levels
- High severity: Training bonds, non-compete clauses, bonus clawbacks
- Medium severity: Long notice periods, high variable pay, extended probation
- Low severity: Gratuity in CTC, reimbursement-heavy packages

## Backup and Restore

### Backup (PostgreSQL)

```bash
# Using Docker
docker-compose exec postgres pg_dump -U offerlens offerlens_dev > backup.sql

# Or directly
pg_dump -U offerlens -h localhost offerlens_dev > backup.sql
```

### Restore

```bash
# Using Docker
docker-compose exec -T postgres psql -U offerlens offerlens_dev < backup.sql

# Or directly
psql -U offerlens -h localhost offerlens_dev < backup.sql
```

## Performance Optimization

### Indexes
All frequently queried fields have indexes:
- Salary lookups: `(role, experience_level, city)`
- Feature requests: `(status, created_at)`
- Analytics: `(event_type, created_at)`

### Connection Pooling
Prisma automatically manages connection pooling. For production, consider:

```env
DATABASE_URL="postgresql://user:pass@host:5432/db?connection_limit=10&pool_timeout=20"
```

### Query Optimization
- Use `select` to fetch only needed fields
- Use `include` instead of multiple queries
- Leverage Prisma's query batching

## Troubleshooting

### Connection Refused

```bash
# Check if PostgreSQL is running
docker-compose ps

# Check logs
docker-compose logs postgres
```

### Migration Conflicts

```bash
# Reset migrations (development only)
npx prisma migrate reset

# Or resolve manually
npx prisma migrate resolve --applied "migration_name"
```

### Prisma Client Out of Sync

```bash
# Regenerate client
npm run prisma:generate
```

### Seed Script Fails

```bash
# Check database connection
npx prisma db pull

# Run seed with verbose logging
NODE_ENV=development npm run prisma:seed
```

## Production Deployment

### Railway

1. Add PostgreSQL plugin in Railway dashboard
2. `DATABASE_URL` is automatically set
3. Run migrations on deploy:

```json
{
  "build": {
    "builder": "NIXPACKS"
  },
  "deploy": {
    "startCommand": "npm run prisma:migrate:deploy && npm start"
  }
}
```

### Manual Deployment

1. Set `DATABASE_URL` environment variable
2. Run migrations: `npm run prisma:migrate:deploy`
3. Optionally seed: `npm run prisma:seed`
4. Start application: `npm start`

## Security Best Practices

1. **Never commit `.env` files** - Use `.env.example` as template
2. **Use strong passwords** - Change default admin password immediately
3. **Restrict database access** - Use firewall rules and VPC
4. **Enable SSL** - Add `?sslmode=require` to DATABASE_URL in production
5. **Regular backups** - Automate daily backups
6. **Monitor queries** - Enable Prisma query logging in development only

## Additional Resources

- [Prisma Documentation](https://www.prisma.io/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Railway PostgreSQL Guide](https://docs.railway.app/databases/postgresql)
