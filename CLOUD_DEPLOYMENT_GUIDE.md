# Cloud Deployment Guide

Comprehensive guide for deploying OfferLens to cloud platforms, with primary focus on Railway (backend) and Vercel (frontend).

## Table of Contents

- [Overview](#overview)
- [Primary Deployment: Railway + Vercel](#primary-deployment-railway--vercel)
- [Alternative Platforms](#alternative-platforms)
- [Frontend-Backend Connection](#frontend-backend-connection)
- [Environment-Specific Configuration](#environment-specific-configuration)
- [Deployment Checklist](#deployment-checklist)

## Overview

OfferLens uses a modern cloud deployment architecture:

- **Backend**: Railway (Node.js + PostgreSQL + Redis)
- **Frontend**: Vercel (React + Vite)
- **CI/CD**: Automatic deployments on git push
- **Monitoring**: Railway metrics + Vercel Analytics + UptimeRobot

### Why Railway + Vercel?

**Railway Benefits:**
- Automatic PostgreSQL and Redis provisioning
- Zero-config deployments
- Built-in monitoring and logs
- Affordable pricing ($5/month hobby plan)
- Excellent developer experience

**Vercel Benefits:**
- Optimized for React/Vite
- Global CDN with edge caching
- Automatic preview deployments
- Free hobby plan
- Excellent performance

### Architecture Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel CDN (Global)                       │
│                  React Frontend (Static)                     │
│              https://offerlens.vercel.app                    │
└─────────────────────────────────────────────────────────────┘
                            │
                            │ HTTPS/REST API
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Railway Platform                          │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Express.js Backend API                         │ │
│  │    https://offerlens-backend.railway.app               │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         PostgreSQL 15 Database                         │ │
│  │         (Managed by Railway)                           │ │
│  └────────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────────┐ │
│  │         Redis 7 Cache                                  │ │
│  │         (Managed by Railway)                           │ │
│  └────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Primary Deployment: Railway + Vercel

### Quick Start (Total Time: ~25 minutes)

1. **Backend to Railway** (15 minutes)
   - See detailed guide: [`offerlens-backend/RAILWAY_SETUP.md`](offerlens-backend/RAILWAY_SETUP.md)

2. **Frontend to Vercel** (10 minutes)
   - See detailed guide: [`offerlens-frontend/VERCEL_SETUP.md`](offerlens-frontend/VERCEL_SETUP.md)

### Railway Backend Deployment

#### Prerequisites
- GitHub account with code pushed
- Railway account ([railway.app](https://railway.app))

#### Step-by-Step

**1. Create Railway Project**
```bash
# Sign up at railway.app
# Connect GitHub account
# Create new project from GitHub repo
```

**2. Add PostgreSQL**
```bash
# In Railway dashboard:
# Click "+ New" → "Database" → "Add PostgreSQL"
# Railway automatically provides DATABASE_URL
```

**3. Add Redis**
```bash
# Click "+ New" → "Database" → "Add Redis"
# Railway automatically provides REDIS_URL
```

**4. Configure Environment Variables**

Required variables:
```env
# Auto-provided by Railway
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# You must set these:
JWT_SECRET=<generate-with-openssl-rand-base64-32>
CORS_ORIGIN=https://your-frontend.vercel.app
ADMIN_EMAIL=admin@yourdomain.com
EMAIL_API_KEY=your-email-api-key
```

**5. Run Migrations**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and link
railway login
railway link

# Run migrations
railway run npm run migrate

# Seed data
railway run npm run prisma:seed
```

**6. Deploy**
```bash
# Railway auto-deploys on push to main
git push origin main

# Or deploy manually
railway up
```

**7. Get Backend URL**
```bash
# In Railway dashboard:
# Settings → Domains
# Copy the Railway-provided URL
# Example: https://offerlens-backend-production-xxxx.up.railway.app
```

#### Railway Configuration

**Build Command:**
```bash
npm run build
```

**Start Command:**
```bash
npm run migrate && npm start
```

**Health Check:**
- Path: `/api/v1/health`
- Interval: 30 seconds
- Timeout: 5 seconds

### Vercel Frontend Deployment

#### Prerequisites
- GitHub account with code pushed
- Vercel account ([vercel.com](https://vercel.com))
- Railway backend URL

#### Step-by-Step

**1. Import Project**
```bash
# Sign up at vercel.com
# Connect GitHub account
# Import offerlens-frontend repository
```

**2. Configure Build Settings**

Vercel auto-detects Vite:
- Framework: Vite
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

**3. Set Environment Variable**

```env
VITE_API_URL=https://your-backend.railway.app/api/v1
```

**Important:**
- Include `/api/v1` at the end
- Use `https://`
- No trailing slash

**4. Deploy**
```bash
# Click "Deploy"
# Vercel builds and deploys automatically
# Get your URL: https://offerlens-frontend.vercel.app
```

**5. Update Backend CORS**

```bash
# In Railway dashboard:
# Go to backend service → Variables
# Update CORS_ORIGIN:
CORS_ORIGIN=https://offerlens-frontend.vercel.app

# Railway auto-redeploys
```

**6. Test Integration**
```bash
# Open frontend URL
# Try analyzing an offer
# Verify no CORS errors in browser console
```

#### Vercel Configuration

**Preview Deployments:**
- Automatic for all pull requests
- Each PR gets unique preview URL
- Auto-deleted when PR closed

**Custom Domain:**
```bash
# In Vercel dashboard:
# Settings → Domains → Add
# Add DNS records at your registrar
# Vercel auto-provisions SSL
```

## Frontend-Backend Connection

### CORS Configuration

**Backend (Railway):**
```typescript
// src/app.ts
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
};

app.use(cors(corsOptions));
```

**Environment Variable:**
```env
# Single origin
CORS_ORIGIN=https://offerlens.vercel.app

# Multiple origins (comma-separated)
CORS_ORIGIN=https://offerlens.vercel.app,https://www.offerlens.com
```

### API Client Configuration

**Frontend (Vercel):**
```typescript
// src/lib/api.ts
import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
});
```

**Environment Variable:**
```env
VITE_API_URL=https://offerlens-backend.railway.app/api/v1
```

### Testing Connection

**1. Test Backend Health:**
```bash
curl https://your-backend.railway.app/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-12T10:00:00.000Z",
  "uptime": 123.456
}
```

**2. Test Frontend:**
```bash
# Open frontend URL in browser
# Open DevTools Console (F12)
# Try analyzing an offer
# Check for CORS errors (should be none)
```

**3. Test API Call:**
```bash
# From browser console on frontend:
fetch('https://your-backend.railway.app/api/v1/roles')
  .then(r => r.json())
  .then(console.log)
```

### Common Connection Issues

#### Issue 1: CORS Error

**Symptom:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Solution:**
1. Verify `CORS_ORIGIN` in Railway matches Vercel URL exactly
2. Include `https://`
3. No trailing slash
4. Redeploy backend after changing

#### Issue 2: API Not Found

**Symptom:**
```
404 Not Found
```

**Solution:**
1. Verify `VITE_API_URL` includes `/api/v1`
2. Check backend is running on Railway
3. Test backend URL directly in browser

#### Issue 3: Network Error

**Symptom:**
```
Network Error or Failed to fetch
```

**Solution:**
1. Check backend health endpoint
2. Verify Railway service is running
3. Check Railway logs for errors
4. Verify DNS resolution

## Environment-Specific Configuration

### Development Environment

**Backend (.env):**
```env
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://offerlens:password@localhost:5432/offerlens_dev
REDIS_URL=redis://localhost:6379
JWT_SECRET=dev-secret-change-in-production
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
```

**Frontend (.env):**
```env
VITE_API_URL=http://localhost:3001/api/v1
VITE_ENABLE_FORUM=true
```

### Staging Environment

**Backend (Railway - staging branch):**
```env
NODE_ENV=staging
DATABASE_URL=<railway-provided>
REDIS_URL=<railway-provided>
JWT_SECRET=<strong-secret>
CORS_ORIGIN=https://offerlens-staging.vercel.app
ADMIN_EMAIL=admin@yourdomain.com
EMAIL_API_KEY=<staging-api-key>
LOG_LEVEL=info
```

**Frontend (Vercel - staging branch):**
```env
VITE_API_URL=https://offerlens-backend-staging.railway.app/api/v1
VITE_ENABLE_FORUM=true
```

### Production Environment

**Backend (Railway - main branch):**
```env
NODE_ENV=production
DATABASE_URL=<railway-provided>
REDIS_URL=<railway-provided>
JWT_SECRET=<very-strong-secret>
CORS_ORIGIN=https://offerlens.com,https://www.offerlens.com
ADMIN_EMAIL=admin@offerlens.com
EMAIL_API_KEY=<production-api-key>
RATE_LIMIT_MAX_REQUESTS=20
LOG_LEVEL=warn
```

**Frontend (Vercel - main branch):**
```env
VITE_API_URL=https://api.offerlens.com/api/v1
VITE_ENABLE_FORUM=true
```

## Alternative Platforms

### AWS Deployment

**Backend (EC2 + RDS + ElastiCache):**

**1. Set Up Infrastructure:**
```bash
# Create RDS PostgreSQL instance
# Create ElastiCache Redis cluster
# Create EC2 instance (t3.small or larger)
# Configure security groups
```

**2. Deploy Backend:**
```bash
# SSH into EC2
ssh -i key.pem ubuntu@ec2-instance

# Clone repository
git clone https://github.com/yourusername/offerlens.git
cd offerlens/offerlens-backend

# Install dependencies
npm install

# Set environment variables
export DATABASE_URL=postgresql://...
export REDIS_URL=redis://...
export JWT_SECRET=...
export CORS_ORIGIN=...

# Run migrations
npm run migrate

# Start with PM2
npm install -g pm2
pm2 start npm --name "offerlens-backend" -- start
pm2 save
pm2 startup
```

**3. Configure Load Balancer:**
```bash
# Create Application Load Balancer
# Configure target group pointing to EC2
# Set up health checks: /api/v1/health
# Configure SSL certificate
```

**Frontend (S3 + CloudFront):**

**1. Build Frontend:**
```bash
cd offerlens-frontend
npm run build
```

**2. Deploy to S3:**
```bash
# Create S3 bucket
aws s3 mb s3://offerlens-frontend

# Upload build
aws s3 sync dist/ s3://offerlens-frontend --delete

# Configure bucket for static hosting
aws s3 website s3://offerlens-frontend --index-document index.html
```

**3. Set Up CloudFront:**
```bash
# Create CloudFront distribution
# Origin: S3 bucket
# Configure SSL certificate
# Set up custom domain
```

**Estimated Cost:**
- EC2 t3.small: $15/month
- RDS db.t3.micro: $15/month
- ElastiCache t3.micro: $12/month
- S3 + CloudFront: $5/month
- **Total: ~$47/month**

### DigitalOcean Deployment

**Backend (Droplet + Managed Databases):**

**1. Create Resources:**
```bash
# Create Droplet (Basic, $12/month)
# Create Managed PostgreSQL ($15/month)
# Create Managed Redis ($15/month)
```

**2. Deploy Backend:**
```bash
# SSH into Droplet
ssh root@droplet-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

# Clone and setup
git clone https://github.com/yourusername/offerlens.git
cd offerlens/offerlens-backend
npm install
npm run build

# Configure environment
nano .env

# Start with PM2
npm install -g pm2
pm2 start npm --name "offerlens-backend" -- start
pm2 save
pm2 startup
```

**3. Configure Nginx:**
```nginx
server {
    listen 80;
    server_name api.offerlens.com;

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

**Frontend (App Platform):**

**1. Create App:**
```bash
# In DigitalOcean dashboard:
# Create App → Import from GitHub
# Select offerlens-frontend
# Configure build settings
```

**2. Set Environment Variables:**
```env
VITE_API_URL=https://api.offerlens.com/api/v1
```

**Estimated Cost:**
- Droplet: $12/month
- Managed PostgreSQL: $15/month
- Managed Redis: $15/month
- App Platform: $5/month
- **Total: ~$47/month**

### Render Deployment

**Backend:**

**1. Create Web Service:**
```bash
# In Render dashboard:
# New → Web Service
# Connect GitHub repository
# Configure:
#   - Build Command: npm run build
#   - Start Command: npm run migrate && npm start
```

**2. Add PostgreSQL:**
```bash
# New → PostgreSQL
# Render provides DATABASE_URL automatically
```

**3. Add Redis:**
```bash
# New → Redis
# Render provides REDIS_URL automatically
```

**4. Set Environment Variables:**
```env
JWT_SECRET=<strong-secret>
CORS_ORIGIN=https://your-frontend.onrender.com
ADMIN_EMAIL=admin@yourdomain.com
EMAIL_API_KEY=<api-key>
```

**Frontend:**

**1. Create Static Site:**
```bash
# New → Static Site
# Connect GitHub repository
# Configure:
#   - Build Command: npm run build
#   - Publish Directory: dist
```

**2. Set Environment Variables:**
```env
VITE_API_URL=https://your-backend.onrender.com/api/v1
```

**Estimated Cost:**
- Web Service: $7/month
- PostgreSQL: $7/month
- Redis: $7/month
- Static Site: Free
- **Total: ~$21/month**

## Deployment Checklist

### Pre-Deployment

**Backend:**
- [ ] Code pushed to GitHub
- [ ] All tests passing
- [ ] Environment variables documented
- [ ] Database migrations tested
- [ ] Seed data prepared
- [ ] Health check endpoint working
- [ ] Error handling implemented
- [ ] Logging configured
- [ ] Rate limiting configured
- [ ] CORS configured

**Frontend:**
- [ ] Code pushed to GitHub
- [ ] Build succeeds locally
- [ ] All tests passing
- [ ] Environment variables documented
- [ ] API client configured
- [ ] Error handling implemented
- [ ] Loading states implemented
- [ ] Mobile responsive
- [ ] Browser compatibility tested

### Deployment

**Railway Backend:**
- [ ] Project created
- [ ] PostgreSQL added
- [ ] Redis added
- [ ] Environment variables set
- [ ] JWT_SECRET generated
- [ ] CORS_ORIGIN configured
- [ ] Migrations run
- [ ] Data seeded
- [ ] Health checks enabled
- [ ] Deployment successful
- [ ] Backend URL obtained

**Vercel Frontend:**
- [ ] Project imported
- [ ] Build settings verified
- [ ] VITE_API_URL set
- [ ] Deployment successful
- [ ] Frontend URL obtained
- [ ] Backend CORS updated
- [ ] Integration tested

### Post-Deployment

**Testing:**
- [ ] Health endpoint responds
- [ ] Frontend loads without errors
- [ ] API connectivity works
- [ ] File upload works
- [ ] Feature requests work
- [ ] Admin login works
- [ ] All pages accessible
- [ ] Mobile responsive
- [ ] CORS working correctly
- [ ] Rate limiting working

**Monitoring:**
- [ ] Railway metrics configured
- [ ] Vercel Analytics enabled
- [ ] UptimeRobot monitors created
- [ ] Sentry configured (optional)
- [ ] Email alerts configured
- [ ] Slack/Discord alerts configured (optional)
- [ ] Health checks passing
- [ ] Logs reviewed

**Security:**
- [ ] HTTPS enabled (automatic)
- [ ] JWT_SECRET is strong
- [ ] Environment variables secure
- [ ] CORS properly configured
- [ ] Rate limiting active
- [ ] Input validation working
- [ ] SQL injection prevention verified
- [ ] XSS prevention verified

**Documentation:**
- [ ] Deployment documented
- [ ] Environment variables documented
- [ ] Rollback procedures documented
- [ ] Monitoring setup documented
- [ ] Team trained
- [ ] On-call schedule established

### Custom Domain (Optional)

**Backend:**
- [ ] Custom domain purchased
- [ ] DNS records added
- [ ] SSL certificate provisioned
- [ ] Domain verified
- [ ] CORS updated with new domain

**Frontend:**
- [ ] Custom domain purchased
- [ ] DNS records added
- [ ] SSL certificate provisioned
- [ ] Domain verified
- [ ] Backend CORS updated

## Cost Comparison

### Development/Hobby

| Platform | Backend | Frontend | Database | Cache | Total |
|----------|---------|----------|----------|-------|-------|
| Railway + Vercel | $5 | Free | Included | Included | **$5/mo** |
| Render | $7 | Free | $7 | $7 | **$21/mo** |
| DigitalOcean | $12 | $5 | $15 | $15 | **$47/mo** |
| AWS | $15 | $5 | $15 | $12 | **$47/mo** |

### Production

| Platform | Backend | Frontend | Database | Cache | Total |
|----------|---------|----------|----------|-------|-------|
| Railway + Vercel | $20 | $20 | Included | Included | **$40/mo** |
| Render | $25 | $20 | $25 | $25 | **$95/mo** |
| DigitalOcean | $24 | $12 | $30 | $30 | **$96/mo** |
| AWS | $30 | $10 | $30 | $25 | **$95/mo** |

**Recommendation:** Start with Railway + Vercel for best developer experience and lowest cost.

## Support and Resources

### Platform Documentation
- **Railway**: [docs.railway.app](https://docs.railway.app)
- **Vercel**: [vercel.com/docs](https://vercel.com/docs)
- **AWS**: [aws.amazon.com/documentation](https://aws.amazon.com/documentation)
- **DigitalOcean**: [docs.digitalocean.com](https://docs.digitalocean.com)
- **Render**: [render.com/docs](https://render.com/docs)

### OfferLens Documentation
- **Railway Setup**: [`offerlens-backend/RAILWAY_SETUP.md`](offerlens-backend/RAILWAY_SETUP.md)
- **Vercel Setup**: [`offerlens-frontend/VERCEL_SETUP.md`](offerlens-frontend/VERCEL_SETUP.md)
- **CI/CD**: [`offerlens-backend/CI_CD.md`](offerlens-backend/CI_CD.md)
- **Monitoring**: [`offerlens-backend/MONITORING.md`](offerlens-backend/MONITORING.md)
- **Rollback**: [`offerlens-backend/ROLLBACK.md`](offerlens-backend/ROLLBACK.md)

### Community Support
- **Railway Discord**: [discord.gg/railway](https://discord.gg/railway)
- **Vercel Discord**: [vercel.com/discord](https://vercel.com/discord)
- **GitHub Issues**: Create an issue for bugs
- **GitHub Discussions**: Ask questions

## Next Steps

After successful deployment:

1. **Set Up Monitoring** - Follow [`MONITORING_SETUP.md`](offerlens-backend/MONITORING_SETUP.md)
2. **Configure CI/CD** - Follow [`CI_CD.md`](offerlens-backend/CI_CD.md)
3. **Test Rollback** - Follow [`ROLLBACK.md`](offerlens-backend/ROLLBACK.md)
4. **Optimize Performance** - Review metrics and optimize
5. **Set Up Backups** - Configure automated backups
6. **Train Team** - Share documentation and procedures

## Conclusion

You now have a complete guide for deploying OfferLens to various cloud platforms. The recommended approach is Railway + Vercel for the best balance of cost, performance, and developer experience.

For detailed step-by-step instructions, see the platform-specific guides linked throughout this document.

Happy deploying! 🚀
