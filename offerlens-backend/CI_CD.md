# CI/CD Pipeline Documentation

This document describes the Continuous Integration and Continuous Deployment (CI/CD) setup for OfferLens.

## Overview

OfferLens uses a modern, automated CI/CD pipeline with:

- **Railway**: Backend deployment with auto-deploy on push
- **Vercel**: Frontend deployment with auto-deploy on push
- **GitHub Actions** (Optional): Additional quality checks
- **Automatic Migrations**: Database migrations run on deployment

## Deployment Flow

```
┌─────────────────────────────────────────────────────────────┐
│                     Developer Workflow                       │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
                    git push to GitHub
                            │
                ┌───────────┴───────────┐
                │                       │
                ▼                       ▼
        ┌───────────────┐       ┌──────────────┐
        │    Railway    │       │    Vercel    │
        │   (Backend)   │       │  (Frontend)  │
        └───────────────┘       └──────────────┘
                │                       │
                ▼                       ▼
        1. Install deps         1. Install deps
        2. Run tests (opt)      2. Build Vite app
        3. Build TypeScript     3. Deploy to CDN
        4. Run migrations       4. Invalidate cache
        5. Deploy to Railway    5. Live in seconds
                │                       │
                ▼                       ▼
        ┌───────────────┐       ┌──────────────┐
        │  Production   │       │  Production  │
        │    Backend    │       │   Frontend   │
        └───────────────┘       └──────────────┘
```

## Railway Auto-Deploy (Backend)

### Configuration

Railway automatically deploys when you push to your configured branch (usually `main`).

**Settings in Railway Dashboard:**

1. **Build Command**: `npm run build`
2. **Start Command**: `npm run migrate && npm start`
3. **Watch Paths**: `src/**`, `package.json`, `prisma/**`
4. **Auto Deploy**: Enabled
5. **Branch**: `main`

### Deployment Process

1. **Trigger**: Push to `main` branch
2. **Build**: Railway runs `npm install && npm run build`
3. **Migrate**: Runs `npm run migrate` (Prisma migrations)
4. **Deploy**: Starts application with `npm start`
5. **Health Check**: Verifies `/api/v1/health` endpoint
6. **Rollback**: Automatic rollback if health check fails

### Environment-Specific Deployments

#### Production
- **Branch**: `main`
- **Environment**: `production`
- **Auto-deploy**: Enabled

#### Staging (Optional)
- **Branch**: `staging`
- **Environment**: `staging`
- **Auto-deploy**: Enabled

To set up staging:
1. Create a new Railway service
2. Connect to `staging` branch
3. Add separate PostgreSQL and Redis
4. Configure staging environment variables

## Vercel Auto-Deploy (Frontend)

### Configuration

Vercel automatically deploys on every push and creates preview deployments for PRs.

**Settings in Vercel Dashboard:**

1. **Framework**: Vite
2. **Build Command**: `npm run build`
3. **Output Directory**: `dist`
4. **Install Command**: `npm install`
5. **Node Version**: 20.x

### Deployment Process

1. **Trigger**: Push to any branch
2. **Build**: Vercel runs `npm install && npm run build`
3. **Deploy**: Uploads to CDN
4. **Preview URL**: Generated for each deployment
5. **Production**: Only `main` branch deploys to production domain

### Preview Deployments

Every pull request gets its own preview URL:

```
https://offerlens-frontend-git-feature-branch-username.vercel.app
```

**Benefits:**
- Test changes before merging
- Share with team for review
- Automatic cleanup when PR is closed

### Environment Variables per Branch

Vercel allows different environment variables per environment:

- **Production**: `main` branch
- **Preview**: All other branches
- **Development**: Local development

Example:
```bash
# Production
VITE_API_URL=https://api.offerlens.com/api/v1

# Preview
VITE_API_URL=https://staging-api.railway.app/api/v1

# Development
VITE_API_URL=http://localhost:3001/api/v1
```

## Database Migrations

### Automatic Migrations on Deploy

Migrations run automatically on Railway deployment:

```json
// package.json
{
  "scripts": {
    "migrate": "npx prisma migrate deploy",
    "start": "node dist/index.js"
  }
}
```

Railway start command:
```bash
npm run migrate && npm start
```

### Migration Strategy

1. **Create Migration** (Local):
   ```bash
   npx prisma migrate dev --name add_new_feature
   ```

2. **Commit Migration**:
   ```bash
   git add prisma/migrations
   git commit -m "Add migration for new feature"
   ```

3. **Push to GitHub**:
   ```bash
   git push origin main
   ```

4. **Automatic Deployment**:
   - Railway detects changes
   - Runs migrations before starting app
   - Deploys new version

### Rollback Procedure

If a deployment fails:

1. **Automatic Rollback**: Railway keeps previous version running
2. **Manual Rollback**: 
   ```bash
   # In Railway dashboard
   Deployments → Select previous deployment → Redeploy
   ```

3. **Database Rollback**:
   ```bash
   # Create reverse migration
   npx prisma migrate dev --name rollback_feature_x
   ```

## GitHub Actions (Optional)

For additional quality checks before deployment, you can add GitHub Actions.

### Example Workflow

Create `.github/workflows/ci.yml`:

```yaml
name: CI

on:
  push:
    branches: [ main, staging ]
  pull_request:
    branches: [ main, staging ]

jobs:
  backend-tests:
    runs-on: ubuntu-latest
    
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 5432:5432
      
      redis:
        image: redis:7
        options: >-
          --health-cmd "redis-cli ping"
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5
        ports:
          - 6379:6379
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: offerlens-backend/package-lock.json
      
      - name: Install dependencies
        working-directory: offerlens-backend
        run: npm ci
      
      - name: Run linter
        working-directory: offerlens-backend
        run: npm run lint
      
      - name: Run type check
        working-directory: offerlens-backend
        run: npm run type-check
      
      - name: Run tests
        working-directory: offerlens-backend
        run: npm test
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test
          REDIS_URL: redis://localhost:6379
          JWT_SECRET: test-secret
      
      - name: Build
        working-directory: offerlens-backend
        run: npm run build

  frontend-tests:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: offerlens-frontend/package-lock.json
      
      - name: Install dependencies
        working-directory: offerlens-frontend
        run: npm ci
      
      - name: Run linter
        working-directory: offerlens-frontend
        run: npm run lint
      
      - name: Run type check
        working-directory: offerlens-frontend
        run: npm run type-check
      
      - name: Build
        working-directory: offerlens-frontend
        run: npm run build
        env:
          VITE_API_URL: http://localhost:3001/api/v1
```

### Benefits of GitHub Actions

- ✅ Run tests before deployment
- ✅ Catch issues early
- ✅ Enforce code quality
- ✅ Block PRs with failing tests
- ✅ Parallel testing

### Limitations

- Railway and Vercel deploy regardless of GitHub Actions status
- To block deployment, use Railway's "Deploy Hooks" feature

## Deployment Notifications

### Railway Webhooks

Set up notifications for deployments:

1. Go to Railway project settings
2. Navigate to "Webhooks"
3. Add webhook URL (Slack, Discord, etc.)

Example Slack notification:
```json
{
  "text": "🚀 Backend deployed to production",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment Status:* Success\n*Environment:* Production\n*Commit:* abc123"
      }
    }
  ]
}
```

### Vercel Notifications

Vercel integrations:
1. Go to project settings
2. Navigate to "Integrations"
3. Add Slack, Discord, or custom webhook

## Monitoring Deployments

### Railway Dashboard

Monitor deployments in real-time:
- **Logs**: View build and runtime logs
- **Metrics**: CPU, memory, network usage
- **Deployments**: History of all deployments
- **Health**: Service health status

### Vercel Dashboard

Monitor frontend deployments:
- **Deployments**: List of all deployments
- **Analytics**: Page views, performance
- **Logs**: Function logs (if using serverless functions)
- **Performance**: Core Web Vitals

## Rollback Procedures

### Backend Rollback (Railway)

**Option 1: Redeploy Previous Version**
1. Go to Railway dashboard
2. Click "Deployments"
3. Find previous successful deployment
4. Click "Redeploy"

**Option 2: Git Revert**
```bash
# Revert last commit
git revert HEAD
git push origin main

# Railway auto-deploys reverted version
```

**Option 3: Railway CLI**
```bash
railway rollback
```

### Frontend Rollback (Vercel)

**Option 1: Instant Rollback**
1. Go to Vercel dashboard
2. Click "Deployments"
3. Find previous deployment
4. Click "Promote to Production"

**Option 2: Git Revert**
```bash
git revert HEAD
git push origin main
```

### Database Rollback

**Important**: Database rollbacks are more complex.

**Option 1: Create Reverse Migration**
```bash
# Create migration that undoes changes
npx prisma migrate dev --name rollback_feature_x
git push origin main
```

**Option 2: Restore from Backup**
```bash
# Railway provides automatic backups
# Restore from Railway dashboard: Databases → Backups → Restore
```

## Best Practices

### 1. Branch Strategy

```
main (production)
  ↑
staging (optional)
  ↑
feature branches
```

**Workflow:**
1. Create feature branch from `main`
2. Develop and test locally
3. Push to GitHub (creates preview deployment)
4. Create PR to `staging` (if using staging)
5. Test on staging
6. Merge to `main` for production

### 2. Commit Messages

Use conventional commits:
```bash
feat: add user authentication
fix: resolve CORS issue
docs: update deployment guide
chore: update dependencies
```

### 3. Testing Before Deploy

```bash
# Backend
cd offerlens-backend
npm run lint
npm run type-check
npm test
npm run build

# Frontend
cd offerlens-frontend
npm run lint
npm run type-check
npm run build
```

### 4. Environment Variables

- Never commit `.env` files
- Use `.env.example` for documentation
- Set production variables in Railway/Vercel dashboards
- Use different values for staging/production

### 5. Database Migrations

- Always test migrations locally first
- Create migrations in separate commits
- Never edit existing migrations
- Use descriptive migration names
- Test rollback procedures

### 6. Monitoring

- Set up health checks
- Configure alerts for failures
- Monitor error rates
- Track deployment frequency
- Review logs regularly

## Troubleshooting

### Deployment Fails

**Check:**
1. Build logs in Railway/Vercel
2. Environment variables are set
3. Dependencies are in `package.json`
4. Build command is correct
5. Node.js version compatibility

### Migration Fails

**Check:**
1. Migration syntax is correct
2. Database is accessible
3. No conflicting migrations
4. Sufficient database permissions

### Health Check Fails

**Check:**
1. Application starts successfully
2. Database connection works
3. Redis connection works
4. `/api/v1/health` endpoint responds
5. No runtime errors in logs

### Preview Deployment Issues

**Check:**
1. Environment variables for preview
2. API URL points to correct backend
3. CORS allows preview domain
4. No hardcoded production URLs

## Security Considerations

### Secrets Management

- ✅ Use Railway/Vercel environment variables
- ✅ Rotate secrets regularly
- ✅ Use different secrets for staging/production
- ❌ Never commit secrets to Git
- ❌ Never log secrets

### Access Control

- Limit who can deploy to production
- Use branch protection rules
- Require PR reviews
- Enable 2FA on Railway/Vercel accounts

### Audit Trail

- Review deployment history regularly
- Monitor who deployed what
- Track configuration changes
- Keep logs for compliance

## Performance Optimization

### Build Optimization

**Backend:**
```json
{
  "scripts": {
    "build": "tsc --project tsconfig.build.json"
  }
}
```

**Frontend:**
```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
        },
      },
    },
  },
});
```

### Caching

- Railway caches `node_modules`
- Vercel caches build artifacts
- Use `package-lock.json` for consistent builds

## Cost Optimization

### Railway

- Use Hobby plan for development
- Upgrade to Pro for production
- Monitor usage in dashboard
- Set up spending alerts

### Vercel

- Use Hobby plan for small projects
- Upgrade to Pro for production
- Monitor bandwidth usage
- Optimize bundle size

## Support and Resources

### Documentation

- [Railway Docs](https://docs.railway.app)
- [Vercel Docs](https://vercel.com/docs)
- [Prisma Migrations](https://www.prisma.io/docs/concepts/components/prisma-migrate)

### Community

- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Vercel Discord: [vercel.com/discord](https://vercel.com/discord)

### Getting Help

1. Check this documentation
2. Review platform documentation
3. Check deployment logs
4. Ask in community Discord
5. Contact platform support
