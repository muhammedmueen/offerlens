# Migration Guide: Vite to Next.js Frontend

This guide provides step-by-step instructions for migrating from the Vite frontend to the Next.js frontend, ensuring zero downtime and full backward compatibility.

## Table of Contents

1. [Pre-Migration Checklist](#pre-migration-checklist)
2. [Environment Configuration](#environment-configuration)
3. [Deployment Strategy](#deployment-strategy)
4. [Testing Procedures](#testing-procedures)
5. [Rollback Plan](#rollback-plan)
6. [Post-Migration Verification](#post-migration-verification)

## Pre-Migration Checklist

Before deploying the Next.js frontend, verify the following:

### ✅ Backend Compatibility

- [ ] Backend API is running and accessible
- [ ] All API endpoints are functioning correctly
- [ ] Backend version supports current API contract
- [ ] No breaking changes in backend API

### ✅ Environment Variables

- [ ] `NEXT_PUBLIC_API_URL` is configured
- [ ] `NEXT_PUBLIC_APP_URL` is configured
- [ ] Analytics keys are configured (if using)
- [ ] All required environment variables are set

### ✅ Build Verification

- [ ] Next.js build completes successfully
- [ ] No TypeScript errors
- [ ] No ESLint errors
- [ ] Bundle size is acceptable

### ✅ Test Coverage

- [ ] All unit tests pass
- [ ] All integration tests pass
- [ ] Compatibility tests pass
- [ ] Manual testing completed

## Environment Configuration

### Development Environment

```bash
# .env.local
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_APP_URL=http://localhost:3001
NODE_ENV=development
```

### Staging Environment

```bash
# .env.staging
NEXT_PUBLIC_API_URL=https://staging-api.offerlens.com/api/v1
NEXT_PUBLIC_APP_URL=https://staging.offerlens.com
NODE_ENV=production
```

### Production Environment

```bash
# .env.production
NEXT_PUBLIC_API_URL=https://api.offerlens.com/api/v1
NEXT_PUBLIC_APP_URL=https://offerlens.com
NODE_ENV=production
```

## Deployment Strategy

### Phase 1: Preview Deployment (Week 1)

**Objective:** Deploy to preview environment and test with production backend

1. **Deploy to Preview**
   ```bash
   # Deploy to Vercel preview
   vercel --prod=false
   ```

2. **Configure Environment**
   - Set `NEXT_PUBLIC_API_URL` to production backend
   - Set `NEXT_PUBLIC_APP_URL` to preview URL
   - Enable analytics in preview mode

3. **Run Compatibility Tests**
   ```bash
   # Test with production backend
   BACKEND_URL=https://api.offerlens.com/api/v1 npm run test:production-backend
   ```

4. **Manual Testing**
   - Test all critical user flows
   - Verify file upload works
   - Verify analysis results display correctly
   - Test feature request submission
   - Test forum functionality
   - Verify theme switching
   - Test on multiple devices/browsers

5. **Performance Testing**
   - Run Lighthouse audit
   - Verify performance score > 90
   - Check bundle size
   - Monitor API response times

**Success Criteria:**
- All automated tests pass
- All manual tests pass
- Performance metrics meet targets
- No errors in production backend logs

### Phase 2: Canary Deployment (Week 2)

**Objective:** Route 10% of traffic to Next.js frontend

1. **Deploy to Production**
   ```bash
   # Deploy to Vercel production
   vercel --prod
   ```

2. **Configure Traffic Split**
   - Use Vercel's traffic splitting feature
   - Route 10% of traffic to Next.js
   - Route 90% of traffic to Vite frontend

3. **Monitor Metrics**
   - Error rates
   - Performance metrics
   - User engagement
   - Conversion rates
   - API error rates

4. **Collect Feedback**
   - Monitor user feedback
   - Check error tracking service
   - Review analytics data

**Success Criteria:**
- Error rate < 1%
- Performance metrics comparable or better
- No increase in API errors
- Positive or neutral user feedback

### Phase 3: Gradual Rollout (Week 3-4)

**Objective:** Gradually increase traffic to Next.js frontend

1. **Week 3: 50% Traffic**
   - Increase traffic split to 50/50
   - Continue monitoring metrics
   - Address any issues found

2. **Week 4: 100% Traffic**
   - Route all traffic to Next.js
   - Keep Vite frontend running (standby)
   - Continue monitoring

**Success Criteria:**
- Stable error rates
- Performance metrics maintained
- No critical issues reported

### Phase 4: Deprecation (Week 5)

**Objective:** Deprecate Vite frontend

1. **Final Verification**
   - Verify all users on Next.js
   - Confirm no issues for 1 week
   - Review all metrics

2. **Deprecate Vite Frontend**
   - Stop Vite frontend deployment
   - Archive Vite frontend code
   - Update documentation

3. **Cleanup**
   - Remove traffic splitting configuration
   - Update DNS/CDN configuration
   - Remove old environment variables

## Testing Procedures

### Automated Testing

```bash
# Run all tests
npm test

# Run compatibility tests
npm run test:compatibility

# Run with production backend
BACKEND_URL=https://api.offerlens.com/api/v1 npm run test:production-backend

# Run coverage report
npm run test:coverage
```

### Manual Testing Checklist

#### File Upload Flow
- [ ] Upload PDF file (< 10MB)
- [ ] Upload image file (< 10MB)
- [ ] Try uploading file > 10MB (should fail)
- [ ] Try uploading invalid file type (should fail)
- [ ] Verify upload progress indicator
- [ ] Verify navigation to results page

#### Analysis Results
- [ ] Verify red flags display correctly
- [ ] Verify salary comparison shows all data
- [ ] Verify negotiation tips display
- [ ] Verify take-home salary calculation
- [ ] Verify empty state when no red flags

#### Feature Requests
- [ ] Submit feature request
- [ ] Verify form validation
- [ ] Verify success message
- [ ] Verify form clears after submission
- [ ] Verify error handling

#### Forum
- [ ] View forum posts list
- [ ] Click on discussion thread
- [ ] Verify skeleton loaders
- [ ] Verify error handling

#### Theme
- [ ] Toggle between light/dark themes
- [ ] Verify theme persists on refresh
- [ ] Verify system theme detection

#### Responsive Design
- [ ] Test on mobile (< 640px)
- [ ] Test on tablet (640px - 1024px)
- [ ] Test on desktop (> 1024px)
- [ ] Test window resize behavior

#### Accessibility
- [ ] Test keyboard navigation
- [ ] Test with screen reader
- [ ] Verify focus indicators
- [ ] Verify ARIA labels

### Performance Testing

```bash
# Run Lighthouse audit
npm run lighthouse

# Run production Lighthouse audit
npm run lighthouse:prod
```

**Target Metrics:**
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 90
- SEO: > 90

## Rollback Plan

### Immediate Rollback (< 5 minutes)

If critical issues are detected:

1. **Revert Traffic Split**
   - Route 100% traffic back to Vite frontend
   - Use Vercel dashboard or CLI

2. **Notify Team**
   - Alert development team
   - Document the issue
   - Create incident report

3. **Investigate**
   - Review error logs
   - Check monitoring dashboards
   - Identify root cause

### Gradual Rollback (< 30 minutes)

If issues are detected but not critical:

1. **Reduce Traffic**
   - Decrease Next.js traffic percentage
   - Monitor for improvement

2. **Fix Issues**
   - Deploy hotfix if possible
   - Test fix in preview environment

3. **Resume Rollout**
   - Gradually increase traffic again
   - Continue monitoring

### Rollback Triggers

Automatically rollback if:
- Error rate > 5%
- Performance score drops > 20 points
- API error rate increases > 50%
- Critical functionality broken

## Post-Migration Verification

### Week 1 After Full Migration

- [ ] Monitor error rates daily
- [ ] Review performance metrics
- [ ] Check user feedback
- [ ] Verify analytics data
- [ ] Review API logs

### Week 2-4 After Full Migration

- [ ] Weekly metric reviews
- [ ] Address any issues found
- [ ] Optimize based on data
- [ ] Update documentation

### Success Metrics

**Performance:**
- Lighthouse score > 90
- First Contentful Paint < 1.5s
- Time to Interactive < 3.5s
- Cumulative Layout Shift < 0.1

**Reliability:**
- Error rate < 0.5%
- Uptime > 99.9%
- API success rate > 99%

**User Experience:**
- Bounce rate maintained or improved
- Session duration maintained or improved
- Conversion rate maintained or improved

## Troubleshooting

### Common Issues

#### Issue: API requests failing

**Symptoms:**
- Network errors in console
- "Unable to connect" messages
- 500 errors from backend

**Solutions:**
1. Verify `NEXT_PUBLIC_API_URL` is correct
2. Check backend is running and accessible
3. Verify CORS configuration on backend
4. Check network connectivity

#### Issue: Theme not persisting

**Symptoms:**
- Theme resets on page refresh
- Theme toggle not working

**Solutions:**
1. Check localStorage is enabled
2. Verify `next-themes` is configured correctly
3. Clear browser cache and cookies
4. Check for JavaScript errors

#### Issue: File upload failing

**Symptoms:**
- Upload progress stuck
- "Upload failed" error
- Files not reaching backend

**Solutions:**
1. Verify file size < 10MB
2. Check file type is PDF or image
3. Verify backend upload endpoint is working
4. Check network tab for errors

#### Issue: Performance degradation

**Symptoms:**
- Slow page loads
- High bundle size
- Poor Lighthouse scores

**Solutions:**
1. Run bundle analyzer
2. Check for unnecessary dependencies
3. Verify code splitting is working
4. Optimize images with Next.js Image

## Support

### Documentation
- [Next.js Documentation](https://nextjs.org/docs)
- [Vercel Documentation](https://vercel.com/docs)
- [Backward Compatibility Guide](./BACKWARD_COMPATIBILITY.md)

### Monitoring
- Vercel Analytics Dashboard
- Error Tracking Service (Sentry)
- Backend API Logs

### Contacts
- Development Team: dev@offerlens.com
- DevOps Team: devops@offerlens.com
- Emergency: [On-call rotation]

## Conclusion

This migration guide ensures a smooth transition from the Vite frontend to the Next.js frontend with zero downtime and full backward compatibility. Follow the phases carefully, monitor metrics closely, and be prepared to rollback if issues arise.

The gradual rollout strategy minimizes risk and allows for quick response to any problems. With proper testing and monitoring, the migration should be seamless for users.
