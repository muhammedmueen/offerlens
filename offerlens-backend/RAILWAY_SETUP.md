# Railway Backend Deployment - Step-by-Step Guide

This guide walks you through deploying the OfferLens backend to Railway from scratch.

## Prerequisites

- GitHub account with your code pushed
- Railway account (sign up at [railway.app](https://railway.app))
- 15 minutes of time

## Step 1: Create Railway Account

1. Go to [railway.app](https://railway.app)
2. Click "Login" or "Start a New Project"
3. Sign in with GitHub
4. Authorize Railway to access your repositories

## Step 2: Create New Project

1. Click "New Project" button
2. Select "Deploy from GitHub repo"
3. Choose your `offerlens-backend` repository
   - If you don't see it, click "Configure GitHub App" to grant access
4. Railway will automatically detect Node.js and start building

### What Railway Does Automatically

- Detects `package.json` and identifies Node.js project
- Runs `npm install` to install dependencies
- Runs `npm run build` (if build script exists)
- Starts app with `npm start`
- Assigns a public URL

## Step 3: Add PostgreSQL Database

1. In your Railway project dashboard, click "+ New"
2. Select "Database"
3. Choose "Add PostgreSQL"
4. Railway creates a PostgreSQL 15 instance

### What Happens Automatically

Railway automatically:
- Creates a PostgreSQL database
- Generates a `DATABASE_URL` environment variable
- Connects it to your backend service
- Sets up automatic backups

### Verify Database Connection

1. Click on the PostgreSQL service
2. Go to "Variables" tab
3. You should see `DATABASE_URL` with a value like:
   ```
   postgresql://postgres:xxxxx@containers-us-west-xxx.railway.app:5432/railway
   ```

## Step 4: Add Redis Cache

1. Click "+ New" again
2. Select "Database"
3. Choose "Add Redis"
4. Railway creates a Redis 7 instance

### What Happens Automatically

Railway automatically:
- Creates a Redis instance
- Generates a `REDIS_URL` environment variable
- Connects it to your backend service

### Verify Redis Connection

1. Click on the Redis service
2. Go to "Variables" tab
3. You should see `REDIS_URL` with a value like:
   ```
   redis://default:xxxxx@containers-us-west-xxx.railway.app:6379
   ```

## Step 5: Configure Environment Variables

Now we need to add the environment variables that Railway doesn't provide automatically.

1. Click on your **backend service** (not PostgreSQL or Redis)
2. Go to "Variables" tab
3. Click "+ New Variable"
4. Add each variable below:

### Required Variables

#### JWT_SECRET
```bash
JWT_SECRET=<your-secret-here>
```

**How to generate:**
```bash
# On Mac/Linux
openssl rand -base64 32

# On Windows (PowerShell)
[Convert]::ToBase64String((1..32 | ForEach-Object { Get-Random -Minimum 0 -Maximum 256 }))
```

Copy the output and paste as `JWT_SECRET` value.

#### CORS_ORIGIN
```bash
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

**Important**: 
- Use your actual Vercel frontend URL
- Include `https://`
- No trailing slash
- For multiple origins: `https://app.vercel.app,https://www.yourdomain.com`

#### ADMIN_EMAIL
```bash
ADMIN_EMAIL=admin@yourdomain.com
```

Your email address for admin notifications.

#### EMAIL_API_KEY
```bash
EMAIL_API_KEY=your-email-service-api-key
```

API key from your email service provider (SendGrid, Mailgun, etc.).

### Optional Variables

#### EMAIL_FROM
```bash
EMAIL_FROM=noreply@yourdomain.com
```

Default: `noreply@offerlens.com`

#### NODE_ENV
```bash
NODE_ENV=production
```

Railway sets this automatically, but you can override if needed.

#### RATE_LIMIT_MAX_REQUESTS
```bash
RATE_LIMIT_MAX_REQUESTS=20
```

Default: `10` requests per minute. Increase for production.

#### LOG_LEVEL
```bash
LOG_LEVEL=warn
```

Options: `error`, `warn`, `info`, `debug`. Use `warn` or `info` for production.

### Your Variables Should Look Like This

```
DATABASE_URL=postgresql://postgres:xxxxx@... (auto-provided)
REDIS_URL=redis://default:xxxxx@... (auto-provided)
JWT_SECRET=<your-generated-secret>
CORS_ORIGIN=https://your-app.vercel.app
ADMIN_EMAIL=admin@yourdomain.com
EMAIL_API_KEY=your-email-api-key
EMAIL_FROM=noreply@yourdomain.com
NODE_ENV=production
RATE_LIMIT_MAX_REQUESTS=20
LOG_LEVEL=warn
```

## Step 6: Configure Build and Start Commands

Railway should auto-detect these, but let's verify:

1. Click on your backend service
2. Go to "Settings" tab
3. Scroll to "Deploy" section

### Build Command
```bash
npm run build
```

This compiles TypeScript to JavaScript.

### Start Command
```bash
npm run migrate && npm start
```

This runs database migrations before starting the app.

**Important**: The `&&` ensures migrations run successfully before starting.

### Install Command (Optional)
```bash
npm ci
```

Railway uses this by default. `npm ci` is faster and more reliable than `npm install`.

## Step 7: Run Initial Database Migration

Before your app can start, you need to run the initial database migration.

### Option A: Using Railway Dashboard

1. Click on your backend service
2. Go to "Deployments" tab
3. Click on the latest deployment
4. Once it fails (expected - no migrations yet), click "View Logs"
5. You'll see migration errors

### Option B: Using Railway CLI (Recommended)

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Link to your project
railway link

# Run migrations
railway run npm run migrate

# Or use Prisma directly
railway run npx prisma migrate deploy
```

### Verify Migration Success

Check the logs for:
```
✓ Migrations applied successfully
```

## Step 8: Seed Initial Data

After migrations, seed the database with initial data:

```bash
# Using Railway CLI
railway run npm run prisma:seed
```

This adds:
- Salary benchmarks for 12 roles across 11 cities
- 8 red flag detection rules
- Default admin user

## Step 9: Trigger Deployment

After setting up everything:

1. Go to your backend service
2. Click "Deployments" tab
3. Click "Deploy" button (or push to GitHub to trigger auto-deploy)

### Watch the Build

You'll see:
1. ✓ Installing dependencies
2. ✓ Building TypeScript
3. ✓ Running migrations
4. ✓ Starting application
5. ✓ Health check passed

## Step 10: Get Your Backend URL

1. Click on your backend service
2. Go to "Settings" tab
3. Scroll to "Domains" section
4. You'll see a Railway-provided domain like:
   ```
   https://offerlens-backend-production-xxxx.up.railway.app
   ```

### Test Your Backend

Open in browser:
```
https://your-backend-url.railway.app/api/v1/health
```

You should see:
```json
{
  "status": "ok",
  "timestamp": "2024-12-12T10:00:00.000Z",
  "uptime": 123,
  "environment": "production"
}
```

## Step 11: Configure Custom Domain (Optional)

### Using Railway Subdomain

Railway provides a free subdomain:

1. Go to "Settings" → "Domains"
2. Click "Generate Domain"
3. You get: `your-app.up.railway.app`

### Using Your Own Domain

1. Go to "Settings" → "Domains"
2. Click "Custom Domain"
3. Enter your domain: `api.yourdomain.com`
4. Railway shows DNS records to add:
   ```
   Type: CNAME
   Name: api
   Value: your-app.up.railway.app
   ```
5. Add this CNAME record to your DNS provider
6. Wait for DNS propagation (5-30 minutes)
7. Railway automatically provisions SSL certificate

## Step 12: Enable Health Checks

1. Go to "Settings" → "Health Check"
2. Enable health checks
3. Configure:
   - **Path**: `/api/v1/health`
   - **Interval**: 30 seconds
   - **Timeout**: 5 seconds
   - **Retries**: 3

Railway will:
- Monitor your app every 30 seconds
- Restart if health check fails 3 times
- Alert you of failures

## Step 13: Configure Auto-Deploy

Railway automatically deploys when you push to GitHub.

### Verify Auto-Deploy Settings

1. Go to "Settings" → "Deploy"
2. Ensure "Auto Deploy" is enabled
3. Check "Branch" is set to `main` (or your default branch)

### How It Works

```
git push origin main
    ↓
GitHub webhook triggers Railway
    ↓
Railway pulls latest code
    ↓
Runs build command
    ↓
Runs migrations
    ↓
Starts new deployment
    ↓
Health check passes
    ↓
Switches traffic to new deployment
    ↓
Old deployment shut down
```

## Step 14: Set Up Monitoring

### Railway Metrics

1. Click on your backend service
2. Go to "Metrics" tab
3. View:
   - CPU usage
   - Memory usage
   - Network traffic
   - Request count

### Railway Logs

1. Go to "Logs" tab
2. View real-time logs
3. Filter by:
   - Service (backend, postgres, redis)
   - Log level (error, warn, info)
   - Time range

### External Monitoring (Recommended)

Set up external uptime monitoring:

1. **UptimeRobot** (Free):
   - Sign up at [uptimerobot.com](https://uptimerobot.com)
   - Add monitor for `https://your-backend.railway.app/api/v1/health`
   - Get email alerts on downtime

2. **Sentry** (Error Tracking):
   - Sign up at [sentry.io](https://sentry.io)
   - Get DSN
   - Add to Railway variables: `SENTRY_DSN=your-dsn`

## Step 15: Create Admin User

After deployment, create your first admin user:

```bash
# Using Railway CLI
railway run npm run create-admin

# Or use Prisma Studio
railway run npx prisma studio
```

In Prisma Studio:
1. Open `admin_users` table
2. Click "Add record"
3. Fill in:
   - username: `admin`
   - password_hash: (use bcrypt to hash your password)
   - role: `admin`

## Troubleshooting

### Build Fails

**Error**: `npm ERR! missing script: build`

**Solution**: Ensure `package.json` has:
```json
{
  "scripts": {
    "build": "tsc"
  }
}
```

### Database Connection Fails

**Error**: `ECONNREFUSED` or `Connection timeout`

**Solution**:
1. Verify PostgreSQL service is running
2. Check `DATABASE_URL` is set
3. Ensure services are in same project
4. Try restarting PostgreSQL service

### Redis Connection Fails

**Error**: `ECONNREFUSED` on Redis

**Solution**:
1. Verify Redis service is running
2. Check `REDIS_URL` is set
3. Try restarting Redis service

### Migration Fails

**Error**: `Migration failed to apply`

**Solution**:
```bash
# Reset database (⚠️ deletes all data)
railway run npx prisma migrate reset

# Or apply migrations manually
railway run npx prisma migrate deploy
```

### Health Check Fails

**Error**: Service keeps restarting

**Solution**:
1. Check logs for errors
2. Verify `/api/v1/health` endpoint works
3. Increase health check timeout
4. Check database and Redis connections

### CORS Errors

**Error**: Browser shows CORS errors

**Solution**:
1. Verify `CORS_ORIGIN` matches frontend URL exactly
2. Include `https://`
3. No trailing slash
4. Redeploy after changing

## Next Steps

After successful deployment:

1. ✅ Update frontend `VITE_API_URL` to point to Railway backend
2. ✅ Test all API endpoints
3. ✅ Verify database connectivity
4. ✅ Test file uploads
5. ✅ Verify email notifications work
6. ✅ Set up monitoring and alerts
7. ✅ Configure custom domain
8. ✅ Review and optimize rate limits
9. ✅ Set up database backups (automatic on Railway)
10. ✅ Document your deployment

## Railway CLI Commands

Useful commands for managing your deployment:

```bash
# View logs
railway logs
railway logs --follow

# Run commands in Railway environment
railway run npm run migrate
railway run npx prisma studio

# Connect to database
railway connect postgres

# Connect to Redis
railway connect redis

# Deploy manually
railway up

# Rollback to previous deployment
railway rollback

# View environment variables
railway variables

# Link to different project
railway link
```

## Cost Management

### Railway Pricing

- **Hobby Plan**: $5/month
  - 500 hours execution time
  - $0.000231/GB-hour for memory
  - $0.000463/vCPU-hour for CPU

- **Pro Plan**: $20/month
  - Unlimited execution time
  - Same resource pricing
  - Priority support

### Monitoring Usage

1. Go to project settings
2. Navigate to "Usage"
3. View:
   - Execution hours
   - Memory usage
   - CPU usage
   - Network bandwidth

### Cost Optimization

- Use Hobby plan for development
- Upgrade to Pro for production
- Monitor resource usage
- Optimize database queries
- Use caching effectively
- Set up auto-scaling (Pro plan)

## Support

### Railway Support

- **Documentation**: [docs.railway.app](https://docs.railway.app)
- **Discord**: [discord.gg/railway](https://discord.gg/railway)
- **Status**: [status.railway.app](https://status.railway.app)

### OfferLens Support

- **GitHub Issues**: Create an issue for bugs
- **Discussions**: Ask questions in GitHub Discussions
- **Email**: support@offerlens.com

## Checklist

Before going live:

- [ ] PostgreSQL database added and connected
- [ ] Redis cache added and connected
- [ ] All environment variables configured
- [ ] JWT_SECRET is strong and unique
- [ ] CORS_ORIGIN matches frontend URL
- [ ] Database migrations applied
- [ ] Initial data seeded
- [ ] Health checks enabled
- [ ] Auto-deploy configured
- [ ] Custom domain configured (optional)
- [ ] Monitoring set up
- [ ] Admin user created
- [ ] All endpoints tested
- [ ] Frontend connected and working
- [ ] Email notifications working
- [ ] Rate limiting configured
- [ ] Logs reviewed for errors
- [ ] Backup strategy in place

## Congratulations! 🎉

Your OfferLens backend is now deployed on Railway!

Next: [Deploy the frontend to Vercel](../offerlens-frontend/VERCEL_SETUP.md)
