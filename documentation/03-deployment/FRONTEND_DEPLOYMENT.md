# Next.js Frontend Deployment Guide

Complete guide for deploying the OfferLens Next.js frontend to Vercel with production-ready configuration.

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Vercel Deployment](#vercel-deployment)
- [Custom Domain Setup](#custom-domain-setup)
- [Monitoring and Analytics](#monitoring-and-analytics)
- [Rollback Procedures](#rollback-procedures)
- [Troubleshooting](#troubleshooting)

## Overview

The OfferLens Next.js frontend is optimized for deployment on Vercel, which provides:

- **Automatic deployments** from GitHub
- **Preview deployments** for every pull request
- **Edge network** with global CDN
- **Built-in analytics** and monitoring
- **Zero-config SSL** certificates
- **Instant rollbacks** to previous deployments

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         Users                                │
└─────────────────────────────────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Vercel Edge Network                       │
│                  (Global CDN - 100+ Locations)               │
└─────────────────────────────────────────────────────────────┘
                            │
                            ├─── Static Pages (SSG)
                            │    - Home page
                            │    - 404 page
                            │
                            ├─── Server-Rendered (SSR)
                            │    - Forum page
                            │
                            └─── Client-Rendered (CSR)
                                 - Upload page
                                 - Results page
                                 - Feature request page
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│                    Backend API                               │
│              (Railway/Your Backend Service)                  │
└─────────────────────────────────────────────────────────────┘
```

## Prerequisites

### Required Accounts

1. **GitHub Account**
   - Repository with Next.js frontend code
   - Admin access to repository

2. **Vercel Account**
   - Sign up at [vercel.com](https://vercel.com)
   - Connect GitHub account
   - Free tier available for hobby projects

3. **Backend API**
   - Deployed backend with public URL
   - CORS configured to allow frontend domain
   - Health check endpoint available

### Required Information

Before deployment, gather:

- Backend API URL (e.g., `https://api.offerlens.com`)
- Custom domain (if applicable)
- Analytics IDs (if using third-party analytics)
- Environment-specific configuration values

## Environment Configuration

### Environment Variables

The application uses the following environment variables:

#### Required Variables

```env
# Backend API URL
NEXT_PUBLIC_API_URL=https://api.offerlens.com

# Analytics (Optional)
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=your-analytics-id
```

#### Variable Descriptions

| Variable | Description | Example | Required |
|----------|-------------|---------|----------|
| `NEXT_PUBLIC_API_URL` | Backend API base URL | `https://api.offerlens.com` | Yes |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | Enable/disable analytics | `true` or `false` | No |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | Vercel Analytics ID | `abc123` | No |

**Important Notes:**
- Variables prefixed with `NEXT_PUBLIC_` are exposed to the browser
- Never include sensitive secrets in `NEXT_PUBLIC_` variables
- Backend URL should NOT include `/api/v1` suffix (handled by API client)

### Environment Files

The project includes three environment files:

#### `.env.local` (Development)

```env
# Development environment
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

#### `.env.production` (Production Template)

```env
# Production environment (set in Vercel)
NEXT_PUBLIC_API_URL=https://api.offerlens.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

#### `.env.example` (Documentation)

Template file with all available variables and descriptions.

## Vercel Deployment

### Initial Setup (First-Time Deployment)

#### Step 1: Import Project

1. Go to [vercel.com/new](https://vercel.com/new)
2. Click "Import Git Repository"
3. Select your GitHub repository
4. Choose the `offerlens-frontend(new)` directory if monorepo

#### Step 2: Configure Project

Vercel auto-detects Next.js configuration:

```yaml
Framework Preset: Next.js
Build Command: npm run build
Output Directory: .next
Install Command: npm install
Node Version: 20.x
```

**Root Directory:** If using monorepo, set to `offerlens-frontend(new)`

#### Step 3: Set Environment Variables

In the Vercel dashboard:

1. Go to **Settings** → **Environment Variables**
2. Add the following variables:

**Production Environment:**
```env
NEXT_PUBLIC_API_URL=https://api.offerlens.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

**Preview Environment:**
```env
NEXT_PUBLIC_API_URL=https://api-staging.offerlens.com
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

**Development Environment:**
```env
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

#### Step 4: Deploy

1. Click **Deploy**
2. Wait for build to complete (~2-3 minutes)
3. Get your deployment URL: `https://your-project.vercel.app`

### Subsequent Deployments

After initial setup, deployments are automatic:

**Production Deployments:**
- Triggered by: Push to `main` branch
- URL: Your production domain
- Environment: Production variables

**Preview Deployments:**
- Triggered by: Push to any branch or PR
- URL: Unique preview URL per branch
- Environment: Preview variables
- Auto-deleted when branch/PR closed

### Manual Deployment

If needed, deploy manually:

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Deploy to preview
vercel

# Deploy to production
vercel --prod
```

## Custom Domain Setup

### Adding a Custom Domain

#### Step 1: Add Domain in Vercel

1. Go to **Settings** → **Domains**
2. Click **Add Domain**
3. Enter your domain (e.g., `offerlens.com`)
4. Click **Add**

#### Step 2: Configure DNS

Vercel provides DNS records to add at your registrar:

**For Root Domain (offerlens.com):**
```
Type: A
Name: @
Value: 76.76.21.21
```

**For WWW Subdomain (www.offerlens.com):**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

#### Step 3: Verify Domain

1. Add DNS records at your registrar
2. Wait for DNS propagation (5-60 minutes)
3. Vercel automatically verifies and provisions SSL
4. Domain shows as "Valid" in Vercel dashboard

#### Step 4: Update Backend CORS

Update backend CORS configuration to allow your custom domain:

```env
# In backend environment variables
CORS_ORIGIN=https://offerlens.com,https://www.offerlens.com
```

### Domain Configuration Options

**Redirect WWW to Root:**
```
www.offerlens.com → offerlens.com
```

**Redirect Root to WWW:**
```
offerlens.com → www.offerlens.com
```

Configure in Vercel: **Settings** → **Domains** → Click domain → **Redirect**

## Monitoring and Analytics

### Vercel Analytics

Vercel provides built-in analytics:

#### Enable Analytics

1. Go to **Analytics** tab in Vercel dashboard
2. Click **Enable Analytics**
3. Analytics automatically tracks:
   - Page views
   - Unique visitors
   - Top pages
   - Traffic sources
   - Device types
   - Geographic distribution

#### View Analytics

Access at: `https://vercel.com/[team]/[project]/analytics`

### Core Web Vitals

Vercel automatically tracks Core Web Vitals:

- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1

View in: **Analytics** → **Web Vitals**

### Custom Analytics

If using custom analytics (Google Analytics, Plausible, etc.):

1. Add analytics script to `app/layout.tsx`
2. Set analytics ID in environment variables
3. Respect user privacy preferences
4. Disable in development mode

### Error Tracking

For production error tracking, consider:

**Sentry Integration:**

```bash
npm install @sentry/nextjs
```

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

### Uptime Monitoring

Set up external uptime monitoring:

**UptimeRobot (Free):**
1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add monitor for your domain
3. Set check interval: 5 minutes
4. Configure email/SMS alerts

**Vercel Monitoring:**
- Automatic deployment notifications
- Build failure alerts
- Domain verification alerts

## Rollback Procedures

### Instant Rollback

Vercel keeps all previous deployments:

#### Via Dashboard

1. Go to **Deployments** tab
2. Find the working deployment
3. Click **⋯** → **Promote to Production**
4. Confirm promotion
5. Previous deployment becomes active immediately

#### Via CLI

```bash
# List recent deployments
vercel ls

# Promote specific deployment
vercel promote [deployment-url]
```

### Rollback Scenarios

#### Scenario 1: Broken Production Build

**Symptoms:**
- Build fails
- Application crashes
- Critical bugs

**Action:**
1. Identify last working deployment
2. Promote to production (instant)
3. Fix issue in development
4. Deploy fix to preview
5. Test thoroughly
6. Deploy to production

#### Scenario 2: API Integration Issues

**Symptoms:**
- CORS errors
- API calls failing
- Data not loading

**Action:**
1. Check backend status
2. Verify environment variables
3. Check CORS configuration
4. If frontend issue: rollback
5. If backend issue: fix backend

#### Scenario 3: Performance Degradation

**Symptoms:**
- Slow page loads
- High error rates
- Poor Core Web Vitals

**Action:**
1. Check Vercel Analytics
2. Review deployment logs
3. Identify problematic changes
4. Rollback if necessary
5. Optimize and redeploy

### Rollback Checklist

- [ ] Identify issue and severity
- [ ] Determine if rollback needed
- [ ] Find last working deployment
- [ ] Promote to production
- [ ] Verify rollback successful
- [ ] Monitor error rates
- [ ] Communicate to team
- [ ] Fix issue in development
- [ ] Test fix thoroughly
- [ ] Deploy fix

## Troubleshooting

### Common Issues

#### Issue 1: Build Fails

**Symptoms:**
```
Error: Build failed
```

**Causes:**
- TypeScript errors
- Missing dependencies
- Environment variable issues

**Solutions:**
1. Check build logs in Vercel dashboard
2. Run `npm run build` locally
3. Fix TypeScript errors
4. Verify all dependencies installed
5. Check environment variables set

#### Issue 2: API Connection Fails

**Symptoms:**
```
Network Error
Failed to fetch
```

**Causes:**
- Wrong API URL
- CORS not configured
- Backend down

**Solutions:**
1. Verify `NEXT_PUBLIC_API_URL` is correct
2. Check backend CORS includes frontend domain
3. Test backend health endpoint
4. Check backend logs

#### Issue 3: Environment Variables Not Working

**Symptoms:**
- Variables undefined
- Using wrong values

**Causes:**
- Variables not set in Vercel
- Missing `NEXT_PUBLIC_` prefix
- Wrong environment selected

**Solutions:**
1. Check variables in Vercel dashboard
2. Ensure `NEXT_PUBLIC_` prefix for client-side
3. Verify correct environment (production/preview)
4. Redeploy after changing variables

#### Issue 4: Images Not Loading

**Symptoms:**
```
Image optimization error
```

**Causes:**
- Invalid image domains
- Missing image configuration

**Solutions:**
1. Check `next.config.mjs` image configuration
2. Add remote domains to `remotePatterns`
3. Verify image URLs are correct
4. Check image file sizes

#### Issue 5: Slow Performance

**Symptoms:**
- Long page load times
- Poor Lighthouse scores

**Causes:**
- Large bundle size
- Unoptimized images
- Too many API calls

**Solutions:**
1. Run Lighthouse audit
2. Check bundle size: `npm run build`
3. Optimize images with Next.js Image
4. Implement code splitting
5. Add loading states
6. Use React.lazy for heavy components

### Debug Mode

Enable debug logging:

```env
# In Vercel environment variables
NEXT_PUBLIC_DEBUG=true
```

Then check browser console for detailed logs.

### Getting Help

**Vercel Support:**
- Documentation: [vercel.com/docs](https://vercel.com/docs)
- Discord: [vercel.com/discord](https://vercel.com/discord)
- Support: [vercel.com/support](https://vercel.com/support)

**Project Issues:**
- GitHub Issues: Report bugs
- GitHub Discussions: Ask questions
- Team Chat: Internal support

## Deployment Checklist

### Pre-Deployment

- [ ] All tests passing locally
- [ ] Build succeeds locally (`npm run build`)
- [ ] TypeScript checks pass (`npm run lint`)
- [ ] Environment variables documented
- [ ] Backend API deployed and accessible
- [ ] CORS configured on backend
- [ ] Code reviewed and approved
- [ ] Changes merged to main branch

### Deployment

- [ ] Vercel project configured
- [ ] Environment variables set
- [ ] Custom domain added (if applicable)
- [ ] DNS records configured
- [ ] SSL certificate provisioned
- [ ] Deployment successful
- [ ] No build errors
- [ ] No runtime errors

### Post-Deployment

- [ ] Frontend loads without errors
- [ ] API connectivity working
- [ ] All pages accessible
- [ ] File upload works
- [ ] Forms submit successfully
- [ ] Mobile responsive
- [ ] Cross-browser compatible
- [ ] Analytics tracking
- [ ] Core Web Vitals good
- [ ] Lighthouse score > 90
- [ ] Error tracking configured
- [ ] Uptime monitoring configured
- [ ] Team notified
- [ ] Documentation updated

## Performance Targets

### Lighthouse Scores

Target scores for production:

- **Performance:** > 90
- **Accessibility:** > 95
- **Best Practices:** > 95
- **SEO:** > 95

### Core Web Vitals

- **LCP:** < 2.5s (Good)
- **FID:** < 100ms (Good)
- **CLS:** < 0.1 (Good)

### Bundle Size

- **First Load JS:** < 200 KB
- **Total Bundle:** < 500 KB

Run audit:
```bash
npm run lighthouse
```

## Security Considerations

### Environment Variables

- Never commit `.env.local` or `.env.production`
- Use Vercel dashboard for production secrets
- Rotate secrets regularly
- Use `NEXT_PUBLIC_` only for non-sensitive data

### HTTPS

- Vercel automatically provisions SSL
- All traffic encrypted
- HSTS enabled by default

### Content Security Policy

Configure in `next.config.mjs`:

```javascript
const securityHeaders = [
  {
    key: 'X-DNS-Prefetch-Control',
    value: 'on'
  },
  {
    key: 'X-Frame-Options',
    value: 'SAMEORIGIN'
  },
  {
    key: 'X-Content-Type-Options',
    value: 'nosniff'
  },
];
```

### API Security

- Use HTTPS for all API calls
- Validate all user input
- Sanitize data before display
- Implement rate limiting
- Handle errors gracefully

## Cost Estimation

### Vercel Pricing

**Hobby Plan (Free):**
- Unlimited deployments
- 100 GB bandwidth/month
- Automatic SSL
- Preview deployments
- Analytics (basic)

**Pro Plan ($20/month):**
- Everything in Hobby
- Unlimited bandwidth
- Advanced analytics
- Team collaboration
- Priority support
- Custom domains (unlimited)

**Enterprise (Custom):**
- Everything in Pro
- SLA guarantees
- Dedicated support
- Advanced security
- Custom contracts

### Recommended Plan

- **Development/Testing:** Hobby (Free)
- **Small Production:** Pro ($20/month)
- **Large Production:** Enterprise (Custom)

## Next Steps

After successful deployment:

1. **Monitor Performance**
   - Check Vercel Analytics daily
   - Review Core Web Vitals
   - Monitor error rates

2. **Optimize**
   - Run Lighthouse audits
   - Optimize images
   - Reduce bundle size
   - Improve loading times

3. **Scale**
   - Add custom domain
   - Enable advanced analytics
   - Set up error tracking
   - Configure uptime monitoring

4. **Maintain**
   - Keep dependencies updated
   - Review security advisories
   - Monitor costs
   - Update documentation

## Conclusion

You now have a complete guide for deploying the OfferLens Next.js frontend to Vercel. The platform provides excellent developer experience, automatic deployments, and production-ready infrastructure out of the box.

For additional help, refer to:
- [Vercel Documentation](https://vercel.com/docs)
- [Next.js Deployment Guide](https://nextjs.org/docs/deployment)
- [Project README](./README.md)

Happy deploying! 🚀
