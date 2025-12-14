# Production Deployment - Step-by-Step Execution

**Date:** December 15, 2024  
**Task:** 23. Production Deployment  
**Status:** Ready to Deploy

## Current Status

✅ **Build Verification:** Build completed successfully
- Build time: ~18.6s compilation
- TypeScript check: Passed (22.3s)
- Static pages: 9 pages generated
- No build errors

✅ **Pre-Deployment Checklist:**
- All previous tasks completed (Tasks 1-22)
- Documentation complete
- Environment variables documented
- Monitoring setup documented

## Deployment Instructions

### Option 1: Deploy via Vercel Dashboard (Recommended for First Deployment)

#### Step 1: Create Vercel Account (if not already done)

1. Go to [vercel.com](https://vercel.com)
2. Click "Sign Up"
3. Sign up with GitHub
4. Authorize Vercel to access your repositories

#### Step 2: Import Project

1. Click "Add New..." → "Project"
2. Import your Git repository
3. Select the repository containing this code
4. Configure import settings:
   - **Framework Preset:** Next.js (auto-detected)
   - **Root Directory:** `offerlens-frontend(new)` (if monorepo)
   - **Build Command:** `npm run build` (auto-detected)
   - **Output Directory:** `.next` (auto-detected)
   - **Install Command:** `npm install` (auto-detected)

#### Step 3: Configure Environment Variables

Before deploying, add these environment variables:

**For Production Environment:**

```env
NEXT_PUBLIC_API_URL=https://offerlens-backend-production.up.railway.app
NEXT_PUBLIC_APP_URL=https://your-project.vercel.app
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_DEBUG=false
```

**For Preview Environment:**

```env
NEXT_PUBLIC_API_URL=https://offerlens-backend-production.up.railway.app
NEXT_PUBLIC_APP_URL=https://preview.vercel.app
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_DEBUG=true
```

**How to add:**
1. In the import dialog, scroll to "Environment Variables"
2. Click "Add" for each variable
3. Select which environments (Production, Preview, Development)
4. Enter name and value

#### Step 4: Deploy

1. Click "Deploy"
2. Wait for deployment to complete (2-3 minutes)
3. You'll get a deployment URL like: `https://your-project.vercel.app`

#### Step 5: Verify Deployment

1. Click "Visit" to open your deployed site
2. Test the following:
   - Home page loads
   - Navigation works
   - Upload page accessible
   - Theme toggle works
   - No console errors

### Option 2: Deploy via Vercel CLI

#### Step 1: Install Vercel CLI

```bash
npm install -g vercel
```

#### Step 2: Login to Vercel

```bash
vercel login
```

Follow the prompts to authenticate.

#### Step 3: Deploy to Preview

```bash
# Navigate to the frontend directory
cd offerlens-frontend(new)

# Deploy to preview
vercel
```

This will:
1. Detect Next.js project
2. Ask for project name
3. Ask for settings confirmation
4. Deploy to preview environment
5. Give you a preview URL

#### Step 4: Set Environment Variables

```bash
# Add production environment variables
vercel env add NEXT_PUBLIC_API_URL production
# Enter: https://offerlens-backend-production.up.railway.app

vercel env add NEXT_PUBLIC_APP_URL production
# Enter: https://your-project.vercel.app

vercel env add NEXT_PUBLIC_ENABLE_ANALYTICS production
# Enter: true

vercel env add NEXT_PUBLIC_DEBUG production
# Enter: false
```

Repeat for preview environment:

```bash
vercel env add NEXT_PUBLIC_API_URL preview
# Enter: https://offerlens-backend-production.up.railway.app

vercel env add NEXT_PUBLIC_ENABLE_ANALYTICS preview
# Enter: false

vercel env add NEXT_PUBLIC_DEBUG preview
# Enter: true
```

#### Step 5: Deploy to Production

```bash
vercel --prod
```

This deploys to your production domain.

## Post-Deployment Verification

### 1. Basic Functionality Test

Visit your deployment URL and test:

```
✓ Home page loads
✓ Click "Analyze Your Offer" → Upload page
✓ Try uploading a file (test file validation)
✓ Navigate to Forum page
✓ Navigate to Feature Request page
✓ Test theme toggle (light/dark)
✓ Test mobile responsive (resize browser)
✓ Check browser console (no errors)
```

### 2. API Integration Test

Test API connectivity:

1. Open browser DevTools → Network tab
2. Upload a test file
3. Verify API requests:
   - Request URL starts with backend URL
   - CORS headers present
   - Response status 200 (or appropriate)
   - No CORS errors

### 3. Performance Test

Run Lighthouse audit:

1. Open DevTools → Lighthouse
2. Select "Performance" and "Best Practices"
3. Click "Analyze page load"
4. Verify scores:
   - Performance: > 90
   - Accessibility: > 95
   - Best Practices: > 95
   - SEO: > 95

### 4. Monitor Deployment

Check Vercel Dashboard:

1. Go to your project in Vercel
2. Click "Analytics" tab
3. Verify:
   - Page views tracking
   - Real-time visitors
   - No errors in logs

## Backend CORS Configuration

**IMPORTANT:** Ensure your backend CORS is configured to allow your Vercel domain.

In your backend environment variables (Railway):

```env
CORS_ORIGIN=https://your-project.vercel.app,https://your-project-git-main.vercel.app
```

If you get CORS errors:
1. Add your Vercel domain to backend CORS_ORIGIN
2. Redeploy backend
3. Test again

## Troubleshooting

### Issue: Build Fails

**Error:** "Build failed"

**Solution:**
1. Check build logs in Vercel dashboard
2. Verify all dependencies are in package.json
3. Check for TypeScript errors
4. Try building locally: `npm run build`

### Issue: Environment Variables Not Working

**Error:** API calls fail or use wrong URL

**Solution:**
1. Verify variables are set in Vercel dashboard
2. Ensure `NEXT_PUBLIC_` prefix for client-side variables
3. Redeploy after adding variables
4. Check browser console for actual values

### Issue: CORS Errors

**Error:** "CORS policy: No 'Access-Control-Allow-Origin' header"

**Solution:**
1. Add Vercel domain to backend CORS_ORIGIN
2. Include both production and preview URLs
3. Redeploy backend
4. Clear browser cache and test

### Issue: 404 on Routes

**Error:** Direct navigation to /upload gives 404

**Solution:**
1. Verify Next.js app router structure
2. Check vercel.json configuration
3. Ensure all pages are in app/ directory
4. Redeploy

## Monitoring Setup

### Enable Vercel Analytics

1. Go to Vercel Dashboard → Your Project
2. Click "Analytics" tab
3. Click "Enable Analytics"
4. Analytics will start tracking automatically

### Set Up Uptime Monitoring (Optional)

1. Sign up at [uptimerobot.com](https://uptimerobot.com)
2. Add new monitor:
   - Type: HTTPS
   - URL: Your Vercel URL
   - Interval: 5 minutes
3. Configure email alerts

### Set Up Error Tracking (Optional)

If you want Sentry:

1. Sign up at [sentry.io](https://sentry.io)
2. Create new project (Next.js)
3. Get DSN
4. Add to Vercel environment variables:
   ```
   NEXT_PUBLIC_SENTRY_DSN=your-dsn
   ```
5. Install Sentry: `npm install @sentry/nextjs`
6. Configure Sentry (see Sentry docs)

## Custom Domain Setup (Optional)

### Add Custom Domain

1. Go to Vercel Dashboard → Your Project
2. Click "Settings" → "Domains"
3. Click "Add"
4. Enter your domain (e.g., `offerlens.com`)
5. Vercel provides DNS records

### Configure DNS

At your domain registrar, add:

**For root domain:**
```
Type: A
Name: @
Value: 76.76.21.21
```

**For www subdomain:**
```
Type: CNAME
Name: www
Value: cname.vercel-dns.com
```

### Update Environment Variables

After adding custom domain:

1. Update `NEXT_PUBLIC_APP_URL` to your custom domain
2. Update backend CORS_ORIGIN to include custom domain
3. Redeploy both frontend and backend

## Rollback Procedure

If something goes wrong:

### Instant Rollback (Vercel Dashboard)

1. Go to Vercel Dashboard → Deployments
2. Find the last working deployment
3. Click "..." → "Promote to Production"
4. Deployment switches immediately

### Rollback via CLI

```bash
# List deployments
vercel ls

# Promote specific deployment
vercel promote <deployment-url>
```

## Success Checklist

- [ ] Deployment successful (no build errors)
- [ ] Site accessible at Vercel URL
- [ ] Home page loads correctly
- [ ] All pages accessible
- [ ] File upload works
- [ ] API connectivity working
- [ ] No CORS errors
- [ ] No console errors
- [ ] Mobile responsive
- [ ] Theme toggle works
- [ ] Performance acceptable (Lighthouse > 90)
- [ ] Analytics tracking (if enabled)
- [ ] Monitoring configured
- [ ] Team notified
- [ ] Documentation updated

## Next Steps After Deployment

1. **Monitor First 24 Hours**
   - Check error rates
   - Monitor performance
   - Review user feedback
   - Address any issues

2. **Optimize**
   - Review Lighthouse scores
   - Optimize images
   - Improve loading times
   - Fix any issues found

3. **Scale**
   - Add custom domain
   - Enable advanced analytics
   - Set up error tracking
   - Configure uptime monitoring

4. **Iterate**
   - Collect user feedback
   - Plan improvements
   - Deploy updates
   - Continuous improvement

## Support

### Vercel Support
- Documentation: [vercel.com/docs](https://vercel.com/docs)
- Discord: [vercel.com/discord](https://vercel.com/discord)
- Support: [vercel.com/support](https://vercel.com/support)

### Project Support
- GitHub Issues: Report bugs
- GitHub Discussions: Ask questions
- Documentation: See DEPLOYMENT.md

## Conclusion

Your Next.js frontend is now ready for production deployment! Follow the steps above to deploy to Vercel, test thoroughly, and monitor the deployment.

**Remember:**
- Test preview deployment first
- Verify all features work
- Monitor closely after deployment
- Have rollback plan ready
- Communicate with team

Good luck with your deployment! 🚀

---

**Status:** Ready to Deploy  
**Date:** December 15, 2024  
**Task:** 23. Production Deployment  
**Requirements:** 18.5
