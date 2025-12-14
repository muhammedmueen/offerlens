# Frontend Monitoring and Alerts Guide

Comprehensive guide for monitoring the OfferLens Next.js frontend in production.

## Table of Contents

- [Overview](#overview)
- [Vercel Analytics](#vercel-analytics)
- [Performance Monitoring](#performance-monitoring)
- [Error Tracking](#error-tracking)
- [Uptime Monitoring](#uptime-monitoring)
- [Alerts Configuration](#alerts-configuration)
- [Dashboards](#dashboards)
- [Incident Response](#incident-response)

## Overview

Effective monitoring ensures:
- **High availability** - Detect and respond to outages quickly
- **Performance** - Track Core Web Vitals and user experience
- **Error detection** - Catch and fix bugs before users report them
- **Usage insights** - Understand how users interact with the app

### Monitoring Stack

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Stack                          │
├─────────────────────────────────────────────────────────────┤
│  Vercel Analytics        │ Traffic, performance, vitals     │
│  Vercel Speed Insights   │ Real user monitoring (RUM)       │
│  Sentry (Optional)       │ Error tracking & debugging       │
│  UptimeRobot             │ Uptime monitoring & alerts       │
│  Lighthouse CI           │ Performance audits               │
└─────────────────────────────────────────────────────────────┘
```

## Vercel Analytics

### Enable Analytics

Vercel Analytics is built-in and provides:
- Page views and unique visitors
- Traffic sources and referrers
- Device and browser breakdown
- Geographic distribution
- Top pages and paths

#### Setup

1. **Enable in Vercel Dashboard:**
   - Go to your project
   - Click **Analytics** tab
   - Click **Enable Analytics**

2. **Install Package (Already Included):**
   ```bash
   npm install @vercel/analytics
   ```

3. **Add to Layout (Already Configured):**
   ```typescript
   // app/layout.tsx
   import { Analytics } from '@vercel/analytics/react';
   
   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           {children}
           <Analytics />
         </body>
       </html>
     );
   }
   ```

### Key Metrics

**Traffic Metrics:**
- Total page views
- Unique visitors
- Sessions
- Bounce rate
- Average session duration

**Audience Metrics:**
- Geographic distribution
- Device types (desktop, mobile, tablet)
- Browser types
- Operating systems
- Screen resolutions

**Behavior Metrics:**
- Top pages
- Entry pages
- Exit pages
- User flows
- Conversion funnels

### Viewing Analytics

Access at: `https://vercel.com/[team]/[project]/analytics`

**Time Ranges:**
- Last 24 hours
- Last 7 days
- Last 30 days
- Custom range

## Performance Monitoring

### Vercel Speed Insights

Real User Monitoring (RUM) for Core Web Vitals:

#### Setup

1. **Enable in Vercel Dashboard:**
   - Go to **Speed Insights** tab
   - Click **Enable Speed Insights**

2. **Install Package (Already Included):**
   ```bash
   npm install @vercel/speed-insights
   ```

3. **Add to Layout (Already Configured):**
   ```typescript
   // app/layout.tsx
   import { SpeedInsights } from '@vercel/speed-insights/next';
   
   export default function RootLayout({ children }) {
     return (
       <html>
         <body>
           {children}
           <SpeedInsights />
         </body>
       </html>
     );
   }
   ```

### Core Web Vitals

**Largest Contentful Paint (LCP):**
- **Good:** < 2.5s
- **Needs Improvement:** 2.5s - 4.0s
- **Poor:** > 4.0s

**First Input Delay (FID):**
- **Good:** < 100ms
- **Needs Improvement:** 100ms - 300ms
- **Poor:** > 300ms

**Cumulative Layout Shift (CLS):**
- **Good:** < 0.1
- **Needs Improvement:** 0.1 - 0.25
- **Poor:** > 0.25

### Performance Targets

| Metric | Target | Critical |
|--------|--------|----------|
| LCP | < 2.5s | < 4.0s |
| FID | < 100ms | < 300ms |
| CLS | < 0.1 | < 0.25 |
| TTFB | < 600ms | < 1.8s |
| FCP | < 1.8s | < 3.0s |

### Lighthouse Audits

Run automated Lighthouse audits:

```bash
# Local audit
npm run lighthouse

# Production audit
npm run lighthouse:prod
```

**Target Scores:**
- Performance: > 90
- Accessibility: > 95
- Best Practices: > 95
- SEO: > 95

### Performance Monitoring Checklist

- [ ] Speed Insights enabled
- [ ] Core Web Vitals tracked
- [ ] Lighthouse audits scheduled
- [ ] Performance budgets set
- [ ] Alerts configured for degradation
- [ ] Regular performance reviews

## Error Tracking

### Sentry Integration (Optional)

For comprehensive error tracking:

#### Setup

1. **Install Sentry:**
   ```bash
   npm install @sentry/nextjs
   ```

2. **Initialize Sentry:**
   ```bash
   npx @sentry/wizard@latest -i nextjs
   ```

3. **Configure Client:**
   ```typescript
   // sentry.client.config.ts
   import * as Sentry from '@sentry/nextjs';
   
   Sentry.init({
     dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
     environment: process.env.NODE_ENV,
     tracesSampleRate: 1.0,
     replaysSessionSampleRate: 0.1,
     replaysOnErrorSampleRate: 1.0,
   });
   ```

4. **Configure Server:**
   ```typescript
   // sentry.server.config.ts
   import * as Sentry from '@sentry/nextjs';
   
   Sentry.init({
     dsn: process.env.SENTRY_DSN,
     environment: process.env.NODE_ENV,
     tracesSampleRate: 1.0,
   });
   ```

5. **Add Environment Variables:**
   ```env
   NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
   SENTRY_AUTH_TOKEN=your-auth-token
   ```

### Error Monitoring

**Tracked Errors:**
- JavaScript exceptions
- Unhandled promise rejections
- API call failures
- Component render errors
- Network errors

**Error Context:**
- User information
- Browser and device
- URL and route
- User actions (breadcrumbs)
- Stack traces
- Source maps

### Error Alerts

Configure alerts for:
- New error types
- Error rate spikes
- Critical errors
- Regression errors

## Uptime Monitoring

### UptimeRobot Setup

Free uptime monitoring with alerts:

#### Configuration

1. **Sign Up:**
   - Go to [uptimerobot.com](https://uptimerobot.com)
   - Create free account

2. **Add Monitor:**
   - Click **Add New Monitor**
   - Monitor Type: HTTP(s)
   - Friendly Name: OfferLens Frontend
   - URL: `https://offerlens.com`
   - Monitoring Interval: 5 minutes

3. **Configure Alerts:**
   - Alert Contacts: Add email/SMS
   - Alert When: Down
   - Alert After: 2 failed checks

4. **Add Status Page (Optional):**
   - Create public status page
   - Share with users
   - Show uptime percentage

### Health Checks

Monitor critical endpoints:

**Home Page:**
- URL: `https://offerlens.com`
- Expected: 200 OK
- Interval: 5 minutes

**Upload Page:**
- URL: `https://offerlens.com/upload`
- Expected: 200 OK
- Interval: 5 minutes

**API Connectivity:**
- URL: `https://offerlens.com/api/health` (if you add a health check route)
- Expected: 200 OK
- Interval: 5 minutes

### Uptime Targets

- **Monthly Uptime:** > 99.9% (43 minutes downtime/month)
- **Response Time:** < 500ms average
- **Error Rate:** < 0.1%

## Alerts Configuration

### Alert Channels

**Email Alerts:**
- Deployment notifications
- Error rate spikes
- Performance degradation
- Uptime issues

**Slack Integration:**
```bash
# Add Vercel Slack integration
# Settings → Integrations → Slack
# Configure channels for:
# - Deployments
# - Errors
# - Performance alerts
```

**Discord Integration:**
```bash
# Add webhook URL in Vercel
# Settings → Integrations → Webhooks
# Configure for deployment events
```

### Alert Rules

#### Critical Alerts (Immediate Response)

**Site Down:**
- Trigger: 2 consecutive failed health checks
- Channel: Email + SMS + Slack
- Response: Immediate investigation

**Error Rate Spike:**
- Trigger: Error rate > 5% for 5 minutes
- Channel: Email + Slack
- Response: Check recent deployments

**Performance Degradation:**
- Trigger: LCP > 4s for 10 minutes
- Channel: Email + Slack
- Response: Review performance metrics

#### Warning Alerts (Review Within Hours)

**Increased Error Rate:**
- Trigger: Error rate > 1% for 15 minutes
- Channel: Slack
- Response: Monitor and investigate

**Slow Performance:**
- Trigger: LCP > 2.5s for 30 minutes
- Channel: Slack
- Response: Review and optimize

**High Traffic:**
- Trigger: Traffic > 2x normal
- Channel: Slack
- Response: Monitor capacity

### Alert Configuration Checklist

- [ ] Email alerts configured
- [ ] Slack integration added
- [ ] Critical alerts defined
- [ ] Warning alerts defined
- [ ] On-call schedule established
- [ ] Escalation procedures documented
- [ ] Alert fatigue prevented (not too many)

## Dashboards

### Vercel Dashboard

Primary dashboard for all metrics:

**URL:** `https://vercel.com/[team]/[project]`

**Tabs:**
- **Overview:** Deployment status, recent activity
- **Deployments:** All deployments, logs, rollback
- **Analytics:** Traffic, audience, behavior
- **Speed Insights:** Core Web Vitals, performance
- **Logs:** Real-time logs, errors, warnings
- **Settings:** Configuration, environment variables

### Custom Dashboard

Create custom dashboard for team:

**Metrics to Display:**
- Current uptime status
- Recent deployments
- Error rate (last 24h)
- Core Web Vitals scores
- Traffic overview
- Top pages
- Geographic distribution

**Tools:**
- Grafana (self-hosted)
- Datadog (paid)
- Custom dashboard with Vercel API

### Dashboard Access

**Team Access:**
- Developers: Full access
- Managers: Analytics and overview
- Support: Logs and errors
- Stakeholders: Analytics only

## Incident Response

### Incident Severity Levels

**P0 - Critical (Site Down):**
- Site completely unavailable
- Response: Immediate (< 5 minutes)
- Resolution: < 1 hour

**P1 - High (Major Feature Broken):**
- Core feature unavailable
- Response: < 15 minutes
- Resolution: < 4 hours

**P2 - Medium (Minor Feature Broken):**
- Non-critical feature affected
- Response: < 1 hour
- Resolution: < 24 hours

**P3 - Low (Cosmetic Issue):**
- Visual or minor bug
- Response: < 4 hours
- Resolution: < 1 week

### Incident Response Process

#### 1. Detection
- Alert received
- User report
- Monitoring detection

#### 2. Assessment
- Verify issue
- Determine severity
- Identify affected users

#### 3. Response
- Notify team
- Start investigation
- Communicate status

#### 4. Resolution
- Identify root cause
- Implement fix
- Deploy solution
- Verify fix

#### 5. Post-Mortem
- Document incident
- Analyze root cause
- Identify improvements
- Update procedures

### Incident Response Checklist

**During Incident:**
- [ ] Severity assessed
- [ ] Team notified
- [ ] Status page updated
- [ ] Investigation started
- [ ] Fix identified
- [ ] Fix deployed
- [ ] Verification complete
- [ ] Users notified

**After Incident:**
- [ ] Post-mortem written
- [ ] Root cause documented
- [ ] Action items created
- [ ] Monitoring improved
- [ ] Procedures updated
- [ ] Team debriefed

### Communication Templates

**Status Update:**
```
🔴 INCIDENT: [Brief description]
Severity: P[0-3]
Impact: [Affected features/users]
Status: [Investigating/Identified/Fixing/Resolved]
ETA: [Expected resolution time]
Updates: [Link to status page]
```

**Resolution Notice:**
```
✅ RESOLVED: [Brief description]
Duration: [Start time - End time]
Root Cause: [Brief explanation]
Fix: [What was done]
Prevention: [Steps to prevent recurrence]
```

## Monitoring Best Practices

### Regular Reviews

**Daily:**
- Check error rates
- Review deployment status
- Monitor Core Web Vitals

**Weekly:**
- Review analytics trends
- Check performance metrics
- Review alert history
- Update dashboards

**Monthly:**
- Comprehensive performance review
- Analyze user behavior
- Review incident reports
- Update monitoring strategy

### Continuous Improvement

**Performance:**
- Set performance budgets
- Regular Lighthouse audits
- Optimize based on metrics
- A/B test improvements

**Reliability:**
- Reduce error rates
- Improve uptime
- Faster incident response
- Better monitoring coverage

**User Experience:**
- Analyze user flows
- Identify pain points
- Optimize conversions
- Improve accessibility

## Monitoring Checklist

### Initial Setup
- [ ] Vercel Analytics enabled
- [ ] Speed Insights enabled
- [ ] Error tracking configured
- [ ] Uptime monitoring configured
- [ ] Alerts configured
- [ ] Dashboards created
- [ ] Team access granted
- [ ] Documentation complete

### Ongoing Maintenance
- [ ] Daily error rate check
- [ ] Weekly performance review
- [ ] Monthly analytics review
- [ ] Quarterly monitoring audit
- [ ] Alert rules updated
- [ ] Dashboards maintained
- [ ] Team trained
- [ ] Procedures updated

## Resources

### Documentation
- [Vercel Analytics](https://vercel.com/docs/analytics)
- [Vercel Speed Insights](https://vercel.com/docs/speed-insights)
- [Sentry Next.js](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [UptimeRobot](https://uptimerobot.com/help/)

### Tools
- [Lighthouse](https://developers.google.com/web/tools/lighthouse)
- [WebPageTest](https://www.webpagetest.org/)
- [GTmetrix](https://gtmetrix.com/)
- [PageSpeed Insights](https://pagespeed.web.dev/)

## Conclusion

Comprehensive monitoring ensures high availability, performance, and user satisfaction. Regular reviews and continuous improvement keep the application running smoothly.

For deployment procedures, see [DEPLOYMENT.md](./DEPLOYMENT.md).

Happy monitoring! 📊
