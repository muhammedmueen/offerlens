# Vercel Frontend Deployment - Step-by-Step Guide

This guide walks you through deploying the OfferLens frontend to Vercel from scratch.

## Prerequisites

- GitHub account with your code pushed
- Vercel account (sign up at [vercel.com](https://vercel.com))
- Backend deployed on Railway (see [Railway Setup](../offerlens-backend/RAILWAY_SETUP.md))
- 10 minutes of time

## Step 1: Create Vercel Account

1. Go to [vercel.com](https://vercel.com)
2. Click "Sign Up"
3. Choose "Continue with GitHub"
4. Authorize Vercel to access your repositories

## Step 2: Import Project

1. Click "Add New..." → "Project"
2. You'll see a list of your GitHub repositories
3. Find `offerlens-frontend` and click "Import"
   - If you don't see it, click "Adjust GitHub App Permissions"

## Step 3: Configure Project

Vercel auto-detects Vite configuration. Verify these settings:

### Framework Preset
```
Vite
```

Vercel automatically detects this from `vite.config.ts`.

### Root Directory
```
./
```

Leave as root unless your frontend is in a subdirectory.

### Build Settings

#### Build Command
```bash
npm run build
```

#### Output Directory
```
dist
```

#### Install Command
```bash
npm install
```

**Note**: Vercel auto-detects these from `package.json` and `vite.config.ts`.

### Node.js Version
```
20.x
```

Vercel uses Node.js 20 by default.

## Step 4: Configure Environment Variables

This is the most important step!

1. Scroll down to "Environment Variables"
2. Add the following variable:

### VITE_API_URL

```bash
VITE_API_URL=https://your-backend.railway.app/api/v1
```

**Important**:
- Replace `your-backend.railway.app` with your actual Railway backend URL
- Include `/api/v1` at the end
- Include `https://`
- No trailing slash after `/api/v1`

### How to Get Your Railway Backend URL

1. Go to your Railway project
2. Click on your backend service
3. Go to "Settings" → "Domains"
4. Copy the Railway-provided domain
5. Add `/api/v1` to the end

Example:
```
Railway domain: offerlens-backend-production-xxxx.up.railway.app
VITE_API_URL: https://offerlens-backend-production-xxxx.up.railway.app/api/v1
```

### Environment Scopes

Choose which environments get this variable:

- ✅ **Production**: Main branch deployments
- ✅ **Preview**: Pull request deployments
- ✅ **Development**: Local development (optional)

**Recommendation**: Use the same backend URL for Production and Preview initially. Later, you can set up a staging backend for Preview.

## Step 5: Deploy

1. Click "Deploy"
2. Vercel will:
   - Clone your repository
   - Install dependencies (`npm install`)
   - Build your app (`npm run build`)
   - Deploy to CDN
   - Assign a URL

### Watch the Build

You'll see:
1. ✓ Cloning repository
2. ✓ Installing dependencies
3. ✓ Building application
4. ✓ Uploading to CDN
5. ✓ Deployment ready

This usually takes 1-2 minutes.

## Step 6: Get Your Frontend URL

After deployment succeeds:

1. You'll see a preview of your site
2. Your URL will be something like:
   ```
   https://offerlens-frontend.vercel.app
   ```
3. Click "Visit" to open your deployed site

### Test Your Frontend

1. Open the URL in your browser
2. Try uploading an offer letter
3. Verify it connects to your backend
4. Check browser console for errors

## Step 7: Update Backend CORS

Now that you have your frontend URL, update your backend to allow it:

1. Go to Railway project
2. Click on your backend service
3. Go to "Variables" tab
4. Find `CORS_ORIGIN`
5. Update to your Vercel URL:
   ```bash
   CORS_ORIGIN=https://offerlens-frontend.vercel.app
   ```
6. Railway will automatically redeploy

### Test CORS

1. Refresh your frontend
2. Try analyzing an offer
3. Check browser console - no CORS errors should appear

## Step 8: Configure Custom Domain (Optional)

### Add Your Domain

1. Go to your Vercel project
2. Click "Settings" → "Domains"
3. Click "Add"
4. Enter your domain: `offerlens.com` or `www.offerlens.com`

### Configure DNS

Vercel will show you DNS records to add:

#### For Root Domain (offerlens.com)

```
Type: A
Name: @
Value: 76.76.21.21
```

#### For Subdomain (www.offerlens.com)

```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Add Records to Your DNS Provider

1. Go to your domain registrar (GoDaddy, Namecheap, Cloudflare, etc.)
2. Find DNS settings
3. Add the records shown by Vercel
4. Save changes

### Wait for DNS Propagation

- Usually takes 5-30 minutes
- Can take up to 48 hours in rare cases
- Check status in Vercel dashboard

### SSL Certificate

Vercel automatically provisions SSL certificates:
- Free SSL from Let's Encrypt
- Automatic renewal
- No configuration needed

## Step 9: Configure Preview Deployments

Vercel automatically creates preview deployments for pull requests.

### How It Works

```
Create PR on GitHub
    ↓
Vercel detects PR
    ↓
Builds preview deployment
    ↓
Comments on PR with preview URL
    ↓
Every push updates preview
    ↓
Preview deleted when PR closed
```

### Configure Preview Settings

1. Go to "Settings" → "Git"
2. Configure:
   - ✅ **Production Branch**: `main`
   - ✅ **Preview Deployments**: Enabled
   - ✅ **Automatic Deployments**: Enabled

### Preview Environment Variables

You can set different variables for preview deployments:

1. Go to "Settings" → "Environment Variables"
2. Click on `VITE_API_URL`
3. Choose environments:
   - Production: `https://api.offerlens.com/api/v1`
   - Preview: `https://staging-backend.railway.app/api/v1`

## Step 10: Enable Vercel Analytics (Optional)

Track your frontend performance:

1. Go to "Analytics" tab
2. Click "Enable Analytics"
3. Choose plan:
   - **Hobby**: Free, basic analytics
   - **Pro**: $20/month, advanced analytics

### Metrics Tracked

- Page views
- Unique visitors
- Top pages
- Referrers
- Devices and browsers
- Core Web Vitals (LCP, FID, CLS)

## Step 11: Configure Build Settings (Advanced)

### Build & Development Settings

1. Go to "Settings" → "General"
2. Scroll to "Build & Development Settings"

#### Override Build Command (Optional)

```bash
npm run build
```

#### Override Output Directory (Optional)

```
dist
```

#### Override Install Command (Optional)

```bash
npm ci
```

**Note**: Only override if you need custom behavior.

### Environment Variables per Branch

Set different variables for different branches:

```bash
# Production (main branch)
VITE_API_URL=https://api.offerlens.com/api/v1

# Staging (staging branch)
VITE_API_URL=https://staging-api.railway.app/api/v1

# Preview (all other branches)
VITE_API_URL=https://dev-api.railway.app/api/v1
```

## Step 12: Set Up Deployment Notifications

### Slack Integration

1. Go to "Settings" → "Integrations"
2. Find "Slack"
3. Click "Add"
4. Choose Slack workspace and channel
5. Configure notifications:
   - ✅ Deployment started
   - ✅ Deployment succeeded
   - ✅ Deployment failed

### Discord Integration

1. Go to "Settings" → "Integrations"
2. Find "Discord"
3. Click "Add"
4. Enter Discord webhook URL
5. Configure notifications

### Email Notifications

Vercel sends email notifications by default:
- Deployment failures
- Domain configuration issues
- Billing alerts

Configure in "Settings" → "Notifications"

## Step 13: Configure Performance Settings

### Caching

Vercel automatically caches:
- Static assets (JS, CSS, images)
- API responses (if configured)
- Build outputs

### Edge Network

Vercel deploys to global edge network:
- 100+ locations worldwide
- Automatic CDN
- No configuration needed

### Compression

Vercel automatically compresses:
- Gzip compression
- Brotli compression (when supported)

## Troubleshooting

### Build Fails

**Error**: `npm ERR! missing script: build`

**Solution**: Ensure `package.json` has:
```json
{
  "scripts": {
    "build": "vite build"
  }
}
```

### Environment Variable Not Working

**Error**: `VITE_API_URL is undefined`

**Solution**:
1. Verify variable name starts with `VITE_`
2. Redeploy after adding variable
3. Check variable is set for correct environment

### CORS Errors

**Error**: `Access to fetch at '...' has been blocked by CORS policy`

**Solution**:
1. Verify backend `CORS_ORIGIN` includes your Vercel URL
2. Include `https://`
3. No trailing slash
4. Redeploy backend after changing

### 404 on Routes

**Error**: Direct navigation to routes shows 404

**Solution**: Vercel should auto-detect SPA. If not, create `vercel.json`:

```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Build Timeout

**Error**: Build exceeds time limit

**Solution**:
1. Optimize dependencies
2. Remove unused packages
3. Use dynamic imports
4. Upgrade to Pro plan (longer timeout)

### API Connection Fails

**Error**: Cannot connect to backend

**Solution**:
1. Verify `VITE_API_URL` is correct
2. Test backend URL directly in browser
3. Check backend is running on Railway
4. Verify CORS is configured

## Vercel CLI Commands

Useful commands for local development:

```bash
# Install Vercel CLI
npm install -g vercel

# Login to Vercel
vercel login

# Link to project
vercel link

# Run locally with production environment
vercel dev

# Deploy to preview
vercel

# Deploy to production
vercel --prod

# View logs
vercel logs

# List deployments
vercel ls

# Inspect deployment
vercel inspect <deployment-url>
```

## Performance Optimization

### Bundle Size Optimization

```typescript
// vite.config.ts
export default defineConfig({
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu'],
        },
      },
    },
  },
});
```

### Image Optimization

Use Vercel's Image Optimization:

```tsx
import Image from 'next/image'; // If using Next.js

// Or for Vite, use optimized images
<img 
  src="/image.jpg" 
  loading="lazy" 
  decoding="async"
/>
```

### Code Splitting

```tsx
// Lazy load routes
const Results = lazy(() => import('./pages/Results'));
const Forum = lazy(() => import('./pages/Forum'));

// Use Suspense
<Suspense fallback={<LoadingScreen />}>
  <Routes>
    <Route path="/results" element={<Results />} />
    <Route path="/forum" element={<Forum />} />
  </Routes>
</Suspense>
```

## Cost Management

### Vercel Pricing

- **Hobby Plan**: Free
  - 100GB bandwidth/month
  - Unlimited deployments
  - Automatic HTTPS
  - Good for: Personal projects, demos

- **Pro Plan**: $20/month
  - 1TB bandwidth/month
  - Advanced analytics
  - Password protection
  - Good for: Production apps

### Monitoring Usage

1. Go to "Settings" → "Usage"
2. View:
   - Bandwidth usage
   - Build minutes
   - Serverless function invocations

### Cost Optimization

- Use Hobby plan for development
- Upgrade to Pro for production
- Optimize bundle size
- Use lazy loading
- Compress images
- Enable caching

## Security Best Practices

### Environment Variables

- ✅ Never commit `.env` files
- ✅ Use Vercel dashboard for secrets
- ✅ Prefix with `VITE_` for client-side variables
- ❌ Don't expose sensitive keys in frontend

### HTTPS

- ✅ Vercel provides automatic HTTPS
- ✅ SSL certificates auto-renew
- ✅ HTTP automatically redirects to HTTPS

### Headers

Add security headers in `vercel.json`:

```json
{
  "headers": [
    {
      "source": "/(.*)",
      "headers": [
        {
          "key": "X-Content-Type-Options",
          "value": "nosniff"
        },
        {
          "key": "X-Frame-Options",
          "value": "DENY"
        },
        {
          "key": "X-XSS-Protection",
          "value": "1; mode=block"
        }
      ]
    }
  ]
}
```

## Monitoring and Analytics

### Vercel Analytics

Track performance metrics:
- Core Web Vitals
- Page load times
- User interactions
- Error rates

### Real User Monitoring

```tsx
// src/main.tsx
import { Analytics } from '@vercel/analytics/react';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <Analytics />
  </React.StrictMode>
);
```

### Error Tracking

Integrate Sentry:

```bash
npm install @sentry/react
```

```tsx
// src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
});
```

## Next Steps

After successful deployment:

1. ✅ Test all pages and features
2. ✅ Verify API connectivity
3. ✅ Test file uploads
4. ✅ Check mobile responsiveness
5. ✅ Test on different browsers
6. ✅ Set up monitoring
7. ✅ Configure custom domain
8. ✅ Enable analytics
9. ✅ Set up error tracking
10. ✅ Document your deployment

## Support

### Vercel Support

- **Documentation**: [vercel.com/docs](https://vercel.com/docs)
- **Discord**: [vercel.com/discord](https://vercel.com/discord)
- **Status**: [vercel-status.com](https://vercel-status.com)

### OfferLens Support

- **GitHub Issues**: Create an issue for bugs
- **Discussions**: Ask questions in GitHub Discussions
- **Email**: support@offerlens.com

## Checklist

Before going live:

- [ ] Project imported from GitHub
- [ ] Build settings verified
- [ ] `VITE_API_URL` environment variable set
- [ ] Deployment successful
- [ ] Frontend loads without errors
- [ ] API connection working
- [ ] Backend CORS updated with Vercel URL
- [ ] All pages accessible
- [ ] File upload working
- [ ] Mobile responsive
- [ ] Custom domain configured (optional)
- [ ] SSL certificate active
- [ ] Analytics enabled
- [ ] Preview deployments working
- [ ] Error tracking set up
- [ ] Performance optimized
- [ ] Security headers configured

## Congratulations! 🎉

Your OfferLens frontend is now deployed on Vercel!

Your app is live at: `https://your-app.vercel.app`

Next: [Set up monitoring and CI/CD](../offerlens-backend/CI_CD.md)
