# OfferLens Backend Deployment Guide

This guide covers deploying the OfferLens backend to various platforms, with primary focus on Railway (recommended).

## Table of Contents

- [Quick Start: Railway + Vercel](#quick-start-railway--vercel)
- [Environment Variables](#environment-variables)
- [Railway Deployment (Recommended)](#railway-deployment-recommended)
- [Vercel Frontend Deployment](#vercel-frontend-deployment)
- [Alternative Platforms](#alternative-platforms)
- [Database Migrations](#database-migrations)
- [Monitoring and Maintenance](#monitoring-and-maintenance)
- [Troubleshooting](#troubleshooting)

## Quick Start: Railway + Vercel

The fastest way to deploy OfferLens:

1. **Backend on Railway** (handles API, database, Redis)
2. **Frontend on Vercel** (handles static site hosting)

Total setup time: ~15 minutes

## Environment Variables

### Required Variables

#### Backend (Railway)

| Variable | Description | Example | Auto-provided by Railway? |
|----------|-------------|---------|---------------------------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@host:5432/db` | ✅ Yes (PostgreSQL plugin) |
| `REDIS_URL` | Redis connection string | `redis://host:6379` | ✅ Yes (Redis plugin) |
| `JWT_SECRET` | Secret key for JWT tokens | Generate with `openssl rand -base64 32` | ❌ No - **You must set this** |
| `CORS_ORIGIN` | Allowed frontend origins | `https://yourdomain.com` | ❌ No - **You must set this** |
| `ADMIN_EMAIL` | Admin notification email | `admin@yourdomain.com` | ❌ No |
| `EMAIL_API_KEY` | Email service API key | Your email provider key | ❌ No |
| `NODE_ENV` | Environment | `production` | ❌ No (defaults to production) |
| `PORT` | Server port | `3001` | ✅ Yes (Railway sets automatically) |

#### Frontend (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `https://your-backend.railway.app/api/v1` |

### Optional Variables

- `EMAIL_FROM`: Email sender address (default: `noreply@offerlens.com`)
- `RATE_LIMIT_WINDOW_MS`: Rate limit window in ms (default: `60000`)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: `10`)
- `MAX_FILE_SIZE_MB`: Max upload size (default: `10`)
- `LOG_LEVEL`: Logging level (default: `info`)

## Railway Deployment (Recommended)

Railway provides managed PostgreSQL and Redis, automatic deployments, and simple configuration.

### Prerequisites

- GitHub account
- Railway account (sign up at [railway.app](https://railway.app))
- Your code pushed to GitHub

### Step 1: Create Railway Project

1. Go to [railway.app](https://railway.app) and sign in
2. Click **"New Project"**
3. Select **"Deploy from GitHub repo"**
4. Choose your `offerlens-backend` repository
5. Railway will detect Node.js and start building

### Step 2: Add PostgreSQL Plugin

1. In your Railway project, click **"+ New"**
2. Select **"Database"** → **"Add PostgreSQL"**
3. Railway automatically:
   - Creates a PostgreSQL database
   - Provides `DATABASE_URL` environment variable
   - Connects it to your backend service

### Step 3: Add Redis Plugin

1. Click **"+ New"** again
2. Select **"Database"** → **"Add Redis"**
3. Railway automatically:
   - Creates a Redis instance
   - Provides `REDIS_URL` environment variable
   - Connects it to your backend service

### Step 4: Configure Environment Variables

1. Click on your backend service
2. Go to **"Variables"** tab
3. Add the following variables:

```bash
# Required
JWT_SECRET=<generate-with-openssl-rand-base64-32>
CORS_ORIGIN=https://your-frontend-domain.vercel.app
ADMIN_EMAIL=admin@yourdomain.com
EMAIL_API_KEY=your-email-api-key

# Optional (with defaults)
NODE_ENV=production
EMAIL_FROM=noreply@yourdomain.com
RATE_LIMIT_MAX_REQUESTS=20
LOG_LEVEL=warn
```

**Generate JWT_SECRET:**
```bash
openssl rand -base64 32
```

### Step 5: Run Database Migrations

Railway will automatically run migrations on deployment if you configure it:

1. Go to **"Settings"** → **"Deploy"**
2. Set **"Build Command"**: `npm run build`
3. Set **"Start Command"**: `npm run migrate && npm start`

Or run manually:
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Link to your project
railway link

# Run migrations
railway run npm run migrate
```

### Step 6: Configure Custom Domain (Optional)

1. Go to **"Settings"** → **"Domains"**
2. Click **"Generate Domain"** for a Railway subdomain
3. Or add your custom domain:
   - Click **"Custom Domain"**
   - Enter your domain (e.g., `api.yourdomain.com`)
   - Add the CNAME record to your DNS provider

### Step 7: Enable Health Checks

1. Go to **"Settings"** → **"Health Check"**
2. Set path to: `/api/v1/health`
3. Railway will monitor your service and restart if unhealthy

### Step 8: Configure Auto-Deploy

Railway automatically deploys when you push to your main branch:

1. Go to **"Settings"** → **"Deploy"**
2. Ensure **"Auto Deploy"** is enabled
3. Select your branch (usually `main`)

## Vercel Frontend Deployment

### Step 1: Import Project

1. Go to [vercel.com](https://vercel.com) and sign in
2. Click **"Add New"** → **"Project"**
3. Import your `offerlens-frontend` repository
4. Vercel auto-detects Vite configuration

### Step 2: Configure Build Settings

Vercel should auto-detect these, but verify:

- **Framework Preset**: Vite
- **Build Command**: `npm run build`
- **Output Directory**: `dist`
- **Install Command**: `npm install`

### Step 3: Set Environment Variables

1. Go to **"Settings"** → **"Environment Variables"**
2. Add:

```bash
VITE_API_URL=https://your-backend.railway.app/api/v1
```

**Important**: Replace with your actual Railway backend URL

### Step 4: Deploy

1. Click **"Deploy"**
2. Vercel builds and deploys your frontend
3. You'll get a URL like `your-app.vercel.app`

### Step 5: Update CORS in Backend

Go back to Railway and update `CORS_ORIGIN`:

```bash
CORS_ORIGIN=https://your-app.vercel.app
```

### Step 6: Configure Custom Domain (Optional)

1. Go to **"Settings"** → **"Domains"**
2. Add your custom domain
3. Follow Vercel's DNS configuration instructions

### Step 7: Enable Preview Deployments

Vercel automatically creates preview deployments for pull requests:

1. Go to **"Settings"** → **"Git"**
2. Ensure **"Preview Deployments"** is enabled
3. Each PR gets its own preview URL

## Alternative Platforms

### AWS Deployment

<details>
<summary>Click to expand AWS deployment guide</summary>

#### Services Needed:
- **EC2**: Application server
- **RDS**: PostgreSQL database
- **ElastiCache**: Redis
- **S3**: File storage (optional)
- **CloudFront**: CDN (optional)

#### Steps:

1. **Create RDS PostgreSQL Instance**
   ```bash
   # Note the endpoint and credentials
   ```

2. **Create ElastiCache Redis Cluster**
   ```bash
   # Note the endpoint
   ```

3. **Launch EC2 Instance**
   - Ubuntu 22.04 LTS
   - t3.small or larger
   - Security group: Allow ports 80, 443, 3001

4. **Install Dependencies**
   ```bash
   # SSH into EC2
   sudo apt update
   sudo apt install -y nodejs npm nginx
   ```

5. **Deploy Application**
   ```bash
   git clone your-repo
   cd offerlens-backend
   npm install
   npm run build
   ```

6. **Configure Environment**
   ```bash
   cp .env.production.example .env
   # Edit .env with your values
   ```

7. **Setup PM2**
   ```bash
   npm install -g pm2
   pm2 start dist/index.js --name offerlens-api
   pm2 startup
   pm2 save
   ```

8. **Configure Nginx**
   ```nginx
   server {
       listen 80;
       server_name api.yourdomain.com;
       
       location / {
           proxy_pass http://localhost:3001;
           proxy_http_version 1.1;
           proxy_set_header Upgrade $http_upgrade;
           proxy_set_header Connection 'upgrade';
           proxy_set_header Host $host;
           proxy_cache_bypass $http_upgrade;
       }
   }
   ```

9. **Setup SSL with Let's Encrypt**
   ```bash
   sudo apt install certbot python3-certbot-nginx
   sudo certbot --nginx -d api.yourdomain.com
   ```

</details>

### DigitalOcean Deployment

<details>
<summary>Click to expand DigitalOcean deployment guide</summary>

#### Services Needed:
- **Droplet**: Application server
- **Managed PostgreSQL**: Database
- **Managed Redis**: Cache

#### Steps:

1. **Create Managed PostgreSQL Database**
   - Go to Databases → Create
   - Choose PostgreSQL 15
   - Note connection details

2. **Create Managed Redis**
   - Go to Databases → Create
   - Choose Redis 7
   - Note connection details

3. **Create Droplet**
   - Ubuntu 22.04
   - Basic plan ($12/month or higher)
   - Add SSH key

4. **Setup Application** (similar to AWS steps above)

5. **Use App Platform (Alternative)**
   - Go to App Platform → Create App
   - Connect GitHub repository
   - DigitalOcean auto-detects Node.js
   - Add environment variables
   - Deploy

</details>

### Render Deployment

<details>
<summary>Click to expand Render deployment guide</summary>

Similar to Railway but with different UI:

1. **Create Web Service**
   - Connect GitHub repo
   - Select Node.js environment
   - Set build command: `npm run build`
   - Set start command: `npm start`

2. **Add PostgreSQL**
   - Create PostgreSQL database
   - Note connection string

3. **Add Redis**
   - Create Redis instance
   - Note connection string

4. **Configure Environment Variables**
   - Add all required variables
   - Use connection strings from step 2 & 3

5. **Deploy**
   - Render auto-deploys on push

</details>

## Database Migrations

### Automatic Migrations on Deploy

Configure Railway to run migrations automatically:

```json
// package.json
{
  "scripts": {
    "start": "node dist/index.js",
    "migrate": "npx prisma migrate deploy",
    "postinstall": "npx prisma generate"
  }
}
```

Railway start command:
```bash
npm run migrate && npm start
```

### Manual Migrations

```bash
# Using Railway CLI
railway run npm run migrate

# Or connect directly
DATABASE_URL="your-railway-db-url" npm run migrate
```

### Rollback Migrations

```bash
# Prisma doesn't support automatic rollback
# You need to create a new migration that reverses changes
npx prisma migrate dev --name rollback_feature_x
```

## Monitoring and Maintenance

### Railway Monitoring

Railway provides built-in monitoring:

1. **Logs**: View real-time logs in the dashboard
2. **Metrics**: CPU, memory, network usage
3. **Health Checks**: Automatic restart on failure

### Setting Up Alerts

1. **Railway Webhooks**
   - Go to Settings → Webhooks
   - Add webhook URL for deployment notifications

2. **External Monitoring** (Optional)
   - **UptimeRobot**: Free uptime monitoring
   - **Pingdom**: Advanced monitoring
   - **Sentry**: Error tracking

### Sentry Integration (Optional)

```bash
npm install @sentry/node
```

```typescript
// src/index.ts
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
});
```

### Log Management

Railway stores logs for 7 days. For longer retention:

1. **Papertrail**: Log aggregation
2. **Logtail**: Modern log management
3. **CloudWatch**: If using AWS

## Troubleshooting

### Common Issues

#### 1. Database Connection Fails

**Symptoms**: `ECONNREFUSED` or `Connection timeout`

**Solutions**:
- Verify `DATABASE_URL` is set correctly
- Check PostgreSQL plugin is running in Railway
- Ensure database migrations have run
- Check network connectivity

```bash
# Test connection
railway run npx prisma db pull
```

#### 2. Redis Connection Fails

**Symptoms**: `ECONNREFUSED` on Redis port

**Solutions**:
- Verify `REDIS_URL` is set correctly
- Check Redis plugin is running
- Test connection:

```bash
railway run node -e "const redis = require('redis'); const client = redis.createClient({url: process.env.REDIS_URL}); client.connect().then(() => console.log('Connected')).catch(console.error);"
```

#### 3. CORS Errors

**Symptoms**: Browser console shows CORS errors

**Solutions**:
- Verify `CORS_ORIGIN` matches your frontend URL exactly
- Include protocol (`https://`)
- No trailing slash
- For multiple origins, use comma-separated list

```bash
CORS_ORIGIN=https://app.vercel.app,https://www.yourdomain.com
```

#### 4. Build Fails

**Symptoms**: Deployment fails during build

**Solutions**:
- Check build logs in Railway
- Verify all dependencies are in `package.json`
- Ensure TypeScript compiles locally: `npm run build`
- Check Node.js version compatibility

#### 5. Health Check Fails

**Symptoms**: Railway shows service as unhealthy

**Solutions**:
- Verify `/api/v1/health` endpoint works
- Check database and Redis connections
- Review application logs for errors
- Increase health check timeout if needed

### Getting Help

1. **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
2. **Vercel Support**: [vercel.com/support](https://vercel.com/support)
3. **GitHub Issues**: Create an issue in your repository

## Security Checklist

Before going to production:

- [ ] Generate strong `JWT_SECRET` (32+ characters)
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper `CORS_ORIGIN` (no wildcards)
- [ ] Enable HTTPS (Railway/Vercel handle this)
- [ ] Set up database backups (Railway auto-backups)
- [ ] Configure rate limiting appropriately
- [ ] Review and limit file upload sizes
- [ ] Set up error monitoring (Sentry)
- [ ] Enable health checks
- [ ] Review all environment variables
- [ ] Test all critical endpoints
- [ ] Set up uptime monitoring

## Performance Optimization

### Railway Scaling

1. **Vertical Scaling**: Upgrade plan for more resources
2. **Horizontal Scaling**: Add more instances (Pro plan)

### Database Optimization

1. **Connection Pooling**: Already configured in Prisma
2. **Indexes**: Ensure all foreign keys are indexed
3. **Query Optimization**: Use Prisma query analysis

### Caching Strategy

1. **Redis Caching**: Already implemented for salary data
2. **CDN**: Use Vercel's CDN for frontend
3. **API Caching**: Consider adding cache headers

## Backup and Recovery

### Railway Backups

Railway automatically backs up PostgreSQL:
- Daily backups retained for 7 days (Hobby plan)
- Point-in-time recovery available (Pro plan)

### Manual Backups

```bash
# Backup database
railway run pg_dump $DATABASE_URL > backup.sql

# Restore database
railway run psql $DATABASE_URL < backup.sql
```

### Disaster Recovery Plan

1. **Database Failure**: Restore from Railway backup
2. **Application Failure**: Rollback to previous deployment
3. **Complete Outage**: Deploy to alternative platform using backups

## Cost Estimation

### Railway (Recommended)

- **Hobby Plan**: $5/month
  - Includes: 500 hours execution time
  - PostgreSQL: Included
  - Redis: Included
  - Good for: Development, small production apps

- **Pro Plan**: $20/month
  - Includes: Unlimited execution time
  - Better performance
  - Priority support
  - Good for: Production apps with traffic

### Vercel (Frontend)

- **Hobby Plan**: Free
  - Good for: Personal projects, demos
  - 100GB bandwidth/month

- **Pro Plan**: $20/month
  - Good for: Production apps
  - 1TB bandwidth/month
  - Better performance

### Total Monthly Cost

- **Development**: $0 (Railway Hobby trial + Vercel Free)
- **Small Production**: $5-25/month (Railway Hobby + Vercel Free/Pro)
- **Production**: $40+/month (Railway Pro + Vercel Pro)

## Next Steps

After deployment:

1. ✅ Test all endpoints
2. ✅ Verify database connectivity
3. ✅ Test file uploads
4. ✅ Verify email notifications
5. ✅ Test frontend-backend integration
6. ✅ Set up monitoring
7. ✅ Configure custom domains
8. ✅ Enable SSL (automatic on Railway/Vercel)
9. ✅ Set up CI/CD (automatic on Railway/Vercel)
10. ✅ Create admin user

## Support

For deployment issues:
- Check this documentation first
- Review Railway/Vercel documentation
- Check application logs
- Create GitHub issue if needed
