# Rollback Procedures

This document describes how to rollback deployments when issues occur in production.

## Table of Contents

- [When to Rollback](#when-to-rollback)
- [Backend Rollback (Railway)](#backend-rollback-railway)
- [Frontend Rollback (Vercel)](#frontend-rollback-vercel)
- [Database Rollback](#database-rollback)
- [Complete System Rollback](#complete-system-rollback)
- [Post-Rollback Actions](#post-rollback-actions)
- [Prevention Strategies](#prevention-strategies)

## When to Rollback

Consider rollback when:

- ✅ Critical bugs in production
- ✅ Service is down or unstable
- ✅ Data corruption detected
- ✅ Security vulnerability introduced
- ✅ Performance severely degraded
- ✅ Database migration failed

Don't rollback for:

- ❌ Minor UI issues (can be fixed forward)
- ❌ Non-critical bugs (can be patched)
- ❌ Feature requests (not bugs)
- ❌ Cosmetic issues

## Backend Rollback (Railway)

### Method 1: Instant Rollback (Recommended)

Fastest way to rollback using Railway dashboard:

1. **Go to Railway Dashboard**
   - Navigate to your project
   - Click on backend service

2. **Open Deployments**
   - Click "Deployments" tab
   - You'll see list of all deployments

3. **Find Previous Working Deployment**
   - Look for the last deployment that was working
   - Check deployment time and commit message
   - Verify it's marked as "Success"

4. **Redeploy**
   - Click on the working deployment
   - Click "Redeploy" button
   - Confirm the action

5. **Monitor**
   - Watch logs for successful startup
   - Check health endpoint: `/api/v1/health`
   - Verify service is responding

**Time to rollback**: 2-5 minutes

### Method 2: Git Revert

Rollback by reverting the problematic commit:

```bash
# 1. Identify the bad commit
git log --oneline

# 2. Revert the commit (creates new commit)
git revert <commit-hash>

# 3. Push to trigger auto-deploy
git push origin main
```

**Time to rollback**: 5-10 minutes (includes build time)

### Method 3: Railway CLI

Using Railway CLI for quick rollback:

```bash
# Install Railway CLI if not installed
npm install -g @railway/cli

# Login
railway login

# Link to project
railway link

# List recent deployments
railway status

# Rollback to previous deployment
railway rollback

# Or specify deployment ID
railway rollback <deployment-id>
```

**Time to rollback**: 2-3 minutes

### Verify Backend Rollback

After rollback, verify:

```bash
# Check health endpoint
curl https://your-backend.railway.app/api/v1/health

# Expected response:
{
  "status": "ok",
  "timestamp": "2024-12-12T10:00:00.000Z",
  "uptime": 123,
  "environment": "production"
}

# Check logs
railway logs --tail 100

# Test critical endpoints
curl -X POST https://your-backend.railway.app/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{"offerText": "test", "role": "Software Engineer", ...}'
```

## Frontend Rollback (Vercel)

### Method 1: Instant Rollback (Recommended)

Fastest way to rollback using Vercel dashboard:

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click on frontend project

2. **Open Deployments**
   - Click "Deployments" tab
   - You'll see list of all deployments

3. **Find Previous Working Deployment**
   - Look for the last working deployment
   - Check deployment time and commit
   - Verify it shows "Ready"

4. **Promote to Production**
   - Click on the working deployment
   - Click "Promote to Production" button
   - Confirm the action

5. **Verify**
   - Visit your production URL
   - Test critical user flows
   - Check browser console for errors

**Time to rollback**: Instant (< 1 minute)

### Method 2: Git Revert

Rollback by reverting the commit:

```bash
# 1. Identify the bad commit
git log --oneline

# 2. Revert the commit
git revert <commit-hash>

# 3. Push to trigger auto-deploy
git push origin main
```

**Time to rollback**: 1-2 minutes (Vercel builds are fast)

### Method 3: Vercel CLI

Using Vercel CLI:

```bash
# Install Vercel CLI if not installed
npm install -g vercel

# Login
vercel login

# Link to project
vercel link

# List deployments
vercel ls

# Promote specific deployment to production
vercel promote <deployment-url>
```

**Time to rollback**: < 1 minute

### Verify Frontend Rollback

After rollback:

```bash
# Visit production URL
open https://your-app.vercel.app

# Check specific pages
open https://your-app.vercel.app/upload
open https://your-app.vercel.app/results

# Check browser console
# Should see no errors

# Test API connectivity
# Upload a test offer and verify it works
```

## Database Rollback

Database rollbacks are more complex and risky. Proceed with caution.

### Scenario 1: Migration Failed (Safe)

If migration failed and app won't start:

```bash
# Railway CLI
railway link

# Check migration status
railway run npx prisma migrate status

# If migration is pending, it hasn't been applied yet
# Just fix the migration and redeploy

# If migration partially applied, you may need to reset
# ⚠️ WARNING: This deletes all data
railway run npx prisma migrate reset
```

### Scenario 2: Migration Succeeded but Broke App

If migration applied successfully but broke the application:

#### Option A: Create Reverse Migration (Recommended)

```bash
# 1. Create a new migration that reverses changes
# Example: If you added a column, create migration to remove it

# Local development
npx prisma migrate dev --name rollback_feature_x

# 2. Review the generated SQL
cat prisma/migrations/<timestamp>_rollback_feature_x/migration.sql

# 3. Test locally
npm run dev

# 4. Commit and push
git add prisma/migrations
git commit -m "Rollback: revert feature X migration"
git push origin main

# Railway will auto-deploy and run the reverse migration
```

#### Option B: Restore from Backup

Railway automatically backs up PostgreSQL:

1. **Go to Railway Dashboard**
2. **Click on PostgreSQL service**
3. **Go to "Backups" tab**
4. **Find backup before the migration**
5. **Click "Restore"**
6. **Confirm restoration**

**⚠️ WARNING**: This restores the entire database to that point in time. Any data created after the backup will be lost.

### Scenario 3: Data Corruption

If data was corrupted by application code (not migration):

```bash
# 1. Stop the application (prevent more corruption)
# In Railway: pause the service

# 2. Restore from backup
# Railway Dashboard → PostgreSQL → Backups → Restore

# 3. Rollback application code
# Use Method 1 or 2 from Backend Rollback

# 4. Verify data integrity
railway run npx prisma studio
# Manually check critical data

# 5. Resume application
# Railway: unpause the service
```

### Database Rollback Checklist

Before rolling back database:

- [ ] Identify exactly what changed
- [ ] Check if data was modified
- [ ] Verify backup exists and is recent
- [ ] Estimate data loss from backup restore
- [ ] Notify users if downtime required
- [ ] Document the issue
- [ ] Have rollback plan reviewed
- [ ] Test rollback in staging first (if possible)

## Complete System Rollback

When both frontend and backend need rollback:

### Step 1: Assess the Situation

```bash
# Check what's broken
# - Backend only?
# - Frontend only?
# - Both?
# - Database?

# Check recent deployments
# Railway: Check deployment times
# Vercel: Check deployment times
# GitHub: Check recent commits
```

### Step 2: Rollback in Order

**Order matters!** Rollback in this sequence:

1. **Frontend First** (if broken)
   - Fastest rollback
   - Prevents users from hitting broken backend
   - Use Vercel instant rollback

2. **Backend Second** (if broken)
   - Rollback to matching version
   - Use Railway instant rollback

3. **Database Last** (if necessary)
   - Most risky
   - Only if absolutely necessary
   - Use reverse migration or backup restore

### Step 3: Verify System

```bash
# 1. Check backend health
curl https://your-backend.railway.app/api/v1/health

# 2. Check frontend loads
open https://your-app.vercel.app

# 3. Test critical flow
# - Upload offer
# - Analyze offer
# - View results
# - Submit feature request

# 4. Check logs for errors
railway logs --tail 100

# 5. Monitor for 15-30 minutes
# Watch for errors, performance issues
```

## Post-Rollback Actions

After successful rollback:

### Immediate Actions (Within 1 hour)

1. **Notify Team**
   ```
   Subject: Production Rollback - [Service Name]
   
   We rolled back [service] to [version] due to [issue].
   
   - Rollback time: [time]
   - Affected users: [estimate]
   - Current status: Stable
   - Next steps: [plan]
   ```

2. **Monitor Closely**
   - Watch error rates
   - Check performance metrics
   - Monitor user reports
   - Review logs continuously

3. **Document the Incident**
   - What went wrong
   - When it was detected
   - How it was fixed
   - What was rolled back

### Short-term Actions (Within 24 hours)

1. **Root Cause Analysis**
   - Why did the issue occur?
   - Why wasn't it caught in testing?
   - What can prevent it in future?

2. **Fix the Issue**
   - Create fix in separate branch
   - Test thoroughly
   - Review carefully
   - Deploy to staging first

3. **Update Monitoring**
   - Add alerts for this type of issue
   - Improve health checks
   - Add relevant metrics

### Long-term Actions (Within 1 week)

1. **Post-Mortem**
   - Write detailed post-mortem
   - Share with team
   - Identify improvements
   - Create action items

2. **Improve Process**
   - Update deployment checklist
   - Improve testing procedures
   - Add automated checks
   - Update documentation

3. **Prevent Recurrence**
   - Implement safeguards
   - Add tests for this scenario
   - Update CI/CD pipeline
   - Train team on lessons learned

## Prevention Strategies

### Before Deployment

- [ ] Test thoroughly in staging
- [ ] Run all automated tests
- [ ] Review code changes carefully
- [ ] Check database migrations
- [ ] Verify environment variables
- [ ] Test rollback procedure
- [ ] Have rollback plan ready
- [ ] Schedule deployment during low-traffic time

### During Deployment

- [ ] Monitor deployment logs
- [ ] Watch health checks
- [ ] Check error rates
- [ ] Monitor performance metrics
- [ ] Test critical endpoints
- [ ] Verify database migrations
- [ ] Check frontend loads
- [ ] Test user flows

### After Deployment

- [ ] Monitor for 30 minutes minimum
- [ ] Check error tracking (Sentry)
- [ ] Review logs for warnings
- [ ] Monitor user reports
- [ ] Check performance metrics
- [ ] Verify all features work
- [ ] Test on multiple devices
- [ ] Document any issues

## Rollback Decision Matrix

| Issue Severity | Response Time | Action |
|---------------|---------------|--------|
| **Critical** - Service down | Immediate | Instant rollback |
| **High** - Major feature broken | < 15 minutes | Rollback or hotfix |
| **Medium** - Minor feature broken | < 1 hour | Hotfix preferred |
| **Low** - Cosmetic issue | Next deployment | Fix forward |

## Emergency Contacts

Keep this information updated:

```
Primary On-Call: [Name] - [Phone] - [Email]
Secondary On-Call: [Name] - [Phone] - [Email]
DevOps Lead: [Name] - [Phone] - [Email]
CTO/Tech Lead: [Name] - [Phone] - [Email]

Railway Support: support@railway.app
Vercel Support: support@vercel.com
```

## Rollback Checklist

Print this and keep handy:

- [ ] Identify the issue
- [ ] Assess severity
- [ ] Decide: rollback or fix forward?
- [ ] Notify team
- [ ] Execute rollback (frontend first)
- [ ] Verify rollback successful
- [ ] Monitor for 30 minutes
- [ ] Document incident
- [ ] Plan fix
- [ ] Conduct post-mortem

## Testing Rollback Procedures

Practice rollback regularly:

```bash
# Monthly drill
1. Deploy a test change to staging
2. Practice rolling back
3. Time the process
4. Document any issues
5. Update procedures
```

## Resources

- [Railway Deployments Docs](https://docs.railway.app/deploy/deployments)
- [Vercel Deployments Docs](https://vercel.com/docs/deployments)
- [Prisma Migrations Docs](https://www.prisma.io/docs/concepts/components/prisma-migrate)
- [Incident Response Guide](https://response.pagerduty.com/)

## Support

For rollback assistance:
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Vercel Discord: [vercel.com/discord](https://vercel.com/discord)
- Team Slack: #incidents channel
