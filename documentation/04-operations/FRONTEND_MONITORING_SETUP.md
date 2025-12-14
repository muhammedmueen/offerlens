# Monitoring and Alerts Setup Guide

Complete guide for setting up monitoring, alerts, and observability for the OfferLens Next.js frontend.

## Table of Contents

- [Overview](#overview)
- [Vercel Built-in Monitoring](#vercel-built-in-monitoring)
- [External Monitoring Services](#external-monitoring-services)
- [Error Tracking](#error-tracking)
- [Performance Monitoring](#performance-monitoring)
- [Uptime Monitoring](#uptime-monitoring)
- [Alert Configuration](#alert-configuration)
- [Dashboard Setup](#dashboard-setup)
- [Incident Response](#incident-response)

## Overview

### Monitoring Strategy

```
┌─────────────────────────────────────────────────────────────┐
│                    Monitoring Layers                         │
├─────────────────────────────────────────────────────────────┤
│  1. Vercel Platform Monitoring (Built-in)                   │
│     - Analytics                                              │
│     - Speed Insights                                         │
│     - Deployment Logs                                        │
│     - Build Logs                                             │
├─────────────────────────────────────────────────────────────┤
│  2. Uptime Monitoring (External)                             │
│     - UptimeRobot                                            │
│     - Pingdom (alternative)                                  │
│     - StatusCake (alternative)                               │
├─────────────────────────────────────────────────────────────┤
│  3. Error Tracking (Optional)                                │
│     - Sentry                                                 │
│     - LogRocket (alternative)                                │
│     - Rollbar (alternative)                                  │
├─────────────────────────────────────────────────────────────┤
│  4. Performance Monitoring                                   │
│     - Vercel Speed Insights                                  │
│     - Lighthouse CI                                          │
│     - WebPageTest                                            │
├─────────────────────────────────────────────────────────────┤
│  5. User Analytics                                           │
│     - Vercel Analytics                                       │
│     - Google Analytics (optional)                            │
│     - Plausible (privacy-focused alternative)                │
└─────────────────────────────────────────────────────────────┘
```

### Monitoring Goals

1. **Availability**: Ensure site is accessible 99.9% of the time
2. **Performance**: Maintain Lighthouse score > 90
3. **Errors**: Detect and resolve errors quickly
4. **User Experience**: Track Core Web Vitals
5. **Business Metrics**: Monitor conversions and engagement

## Vercel Built-in Monitoring

### Analytics

Vercel Analytics provides real-time insights into your application's usage.

#### Enable Analytics

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click **Analytics** tab

2. **Enable Analytics**
   - Click **Enable Analytics**
   - Analytics starts tracking immediately

3. **No Code Changes Required**
   - Vercel automatically injects tracking
   - Works with all Next.js pages

#### Metrics Available

**Traffic Metrics:**
- Page views
- Unique visitors
- Sessions
- Bounce rate
- Session duration

**Page Metrics:**
- Top pages
- Page views per page
- Unique visitors per page
- Average time on page

**Source Metrics:**
- Traffic sources (direct, referral, social)
- Top referrers
- Geographic distribution
- Device types (desktop, mobile, tablet)

**Conversion Metrics:**
- Custom events
- Conversion rate
- Funnel analysis

#### Custom Events

Track custom events in your application:

```typescript
// lib/analytics.ts
export function trackEvent(eventName: string, properties?: Record<string, any>) {
  if (typeof window !== 'undefined' && window.va) {
    window.va('track', eventName, properties);
  }
}

// Usage in components
import { trackEvent } from '@/lib/analytics';

function UploadButton() {
  const handleUpload = () => {
    trackEvent('file_upload_started', {
      fileType: file.type,
      fileSize: file.size,
    });
  };
  
  return <button onClick={handleUpload}>Upload</button>;
}
```

**Events to Track:**
- `file_upload_started`
- `file_upload_completed`
- `analysis_viewed`
- `feature_request_submitted`
- `forum_post_viewed`

### Speed Insights

Vercel Speed Insights tracks Core Web Vitals and performance metrics.

#### Enable Speed Insights

1. **Go to Vercel Dashboard**
   - Navigate to your project
   - Click **Speed Insights** tab

2. **Enable Speed Insights**
   - Click **Enable Speed Insights**
   - Tracking starts immediately

3. **Install Package (Optional)**
   ```bash
   npm install @vercel/speed-insights
   ```

4. **Add to Layout (Optional)**
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

#### Metrics Tracked

**Core Web Vitals:**
- **LCP** (Largest Contentful Paint): < 2.5s
- **FID** (First Input Delay): < 100ms
- **CLS** (Cumulative Layout Shift): < 0.1
- **TTFB** (Time to First Byte): < 800ms
- **FCP** (First Contentful Paint): < 1.8s

**Performance Score:**
- Overall performance score (0-100)
- Breakdown by metric
- Historical trends

**Page-Level Metrics:**
- Performance by page
- Slowest pages
- Performance distribution

#### Alert Thresholds

Set up alerts for performance degradation:

| Metric | Good | Needs Improvement | Poor |
|--------|------|-------------------|------|
| LCP | < 2.5s | 2.5s - 4.0s | > 4.0s |
| FID | < 100ms | 100ms - 300ms | > 300ms |
| CLS | < 0.1 | 0.1 - 0.25 | > 0.25 |
| TTFB | < 800ms | 800ms - 1800ms | > 1800ms |

### Deployment Logs

Monitor deployment logs for errors and warnings.

#### Access Logs

1. **Go to Vercel Dashboard**
   - Navigate to **Deployments** tab
   - Click on a deployment
   - Click **Logs** tab

2. **Filter Logs**
   - Filter by severity (info, warning, error)
   - Search for specific messages
   - Download logs for analysis

#### Log Types

**Build Logs:**
- Dependency installation
- TypeScript compilation
- Next.js build
- Asset optimization

**Runtime Logs:**
- Server-side rendering
- API routes
- Edge functions
- Errors and warnings

#### Common Log Patterns

**Successful Build:**
```
✓ Compiled successfully
✓ Linting and checking validity of types
✓ Collecting page data
✓ Generating static pages
✓ Finalizing page optimization
```

**Build Error:**
```
✗ Type error: Property 'x' does not exist on type 'Y'
✗ Failed to compile
```

**Runtime Error:**
```
Error: API request failed
  at fetchData (lib/api/client.ts:45)
```

## External Monitoring Services

### Uptime Monitoring (UptimeRobot)

UptimeRobot monitors your site's availability and alerts you when it's down.

#### Setup UptimeRobot

1. **Sign Up**
   - Go to [uptimerobot.com](https://uptimerobot.com)
   - Create free account (50 monitors)

2. **Add Monitor**
   - Click **Add New Monitor**
   - Configure:
     ```
     Monitor Type: HTTP(s)
     Friendly Name: OfferLens Production
     URL: https://offerlens.com
     Monitoring Interval: 5 minutes
     Monitor Timeout: 30 seconds
     ```

3. **Add Alert Contacts**
   - Email: your-email@example.com
   - SMS: +1-xxx-xxx-xxxx (optional)
   - Slack: webhook URL (optional)

4. **Configure Alerts**
   - Alert when: Down
   - Alert after: 1 check (immediate)
   - Re-alert every: 30 minutes

#### Monitors to Create

**Production Site:**
```
URL: https://offerlens.com
Interval: 5 minutes
Alert: Immediate
```

**API Health Check:**
```
URL: https://api.offerlens.com/health
Interval: 5 minutes
Alert: Immediate
```

**Upload Page:**
```
URL: https://offerlens.com/upload
Interval: 10 minutes
Alert: After 2 failures
```

**Results Page:**
```
URL: https://offerlens.com/results
Interval: 10 minutes
Alert: After 2 failures
```

#### Alert Configuration

**Email Alerts:**
- Immediate notification on downtime
- Include response time
- Include error details

**SMS Alerts:**
- Critical downtime only
- Production site down
- API down

**Slack Alerts:**
- All downtime events
- Performance degradation
- SSL certificate expiring

#### Status Page

Create public status page:

1. **Enable Status Page**
   - Go to **Status Pages**
   - Click **Add Status Page**

2. **Configure**
   - Name: OfferLens Status
   - URL: status.offerlens.com
   - Monitors: Select all

3. **Customize**
   - Add logo
   - Add description
   - Choose theme

4. **Share**
   - Add to footer
   - Share with users
   - Link in error messages

### Alternative Uptime Monitors

**Pingdom:**
- More detailed reports
- Transaction monitoring
- Real user monitoring
- Paid service ($10+/month)

**StatusCake:**
- Free tier available
- Page speed monitoring
- SSL monitoring
- Virus scanning

**Better Uptime:**
- Modern interface
- Incident management
- Status pages
- Free tier available

## Error Tracking

### Sentry Setup (Recommended)

Sentry provides real-time error tracking and performance monitoring.

#### Install Sentry

```bash
npm install @sentry/nextjs
npx @sentry/wizard@latest -i nextjs
```

#### Configure Sentry

**1. Client Configuration:**

```typescript
// sentry.client.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  
  // Environment
  environment: process.env.NODE_ENV,
  
  // Performance Monitoring
  tracesSampleRate: 1.0,
  
  // Session Replay
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
  
  // Filtering
  beforeSend(event, hint) {
    // Filter out non-critical errors
    if (event.exception) {
      const error = hint.originalException;
      
      // Ignore network errors
      if (error?.message?.includes('Network Error')) {
        return null;
      }
      
      // Ignore cancelled requests
      if (error?.message?.includes('cancelled')) {
        return null;
      }
    }
    
    return event;
  },
  
  // Ignore specific errors
  ignoreErrors: [
    'ResizeObserver loop limit exceeded',
    'Non-Error promise rejection captured',
  ],
});
```

**2. Server Configuration:**

```typescript
// sentry.server.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

**3. Edge Configuration:**

```typescript
// sentry.edge.config.ts
import * as Sentry from '@sentry/nextjs';

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
});
```

#### Environment Variables

Add to Vercel:

```env
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
SENTRY_AUTH_TOKEN=xxx
SENTRY_ORG=your-org
SENTRY_PROJECT=offerlens-frontend
```

#### Error Tracking

**Automatic Error Capture:**
- Unhandled exceptions
- Promise rejections
- Console errors
- Network errors

**Manual Error Capture:**

```typescript
import * as Sentry from '@sentry/nextjs';

try {
  // Code that might throw
  await uploadFile(file);
} catch (error) {
  Sentry.captureException(error, {
    tags: {
      feature: 'file-upload',
      fileType: file.type,
    },
    extra: {
      fileSize: file.size,
      fileName: file.name,
    },
  });
  
  throw error;
}
```

**Custom Context:**

```typescript
Sentry.setUser({
  id: user.id,
  email: user.email,
});

Sentry.setTag('feature', 'upload');
Sentry.setContext('upload', {
  fileType: file.type,
  fileSize: file.size,
});
```

#### Alert Rules

Configure alerts in Sentry dashboard:

**New Issue Alert:**
- Trigger: New error type
- Action: Email team
- Frequency: Immediate

**Error Rate Alert:**
- Trigger: Error rate > 1%
- Action: Email + Slack
- Frequency: Every 30 minutes

**Performance Alert:**
- Trigger: P95 response time > 3s
- Action: Email
- Frequency: Daily

### Alternative Error Tracking

**LogRocket:**
- Session replay
- Performance monitoring
- User analytics
- Paid service ($99+/month)

**Rollbar:**
- Error tracking
- Deployment tracking
- Integrations
- Free tier available

**Bugsnag:**
- Error monitoring
- Release tracking
- Stability score
- Free tier available

## Performance Monitoring

### Lighthouse CI

Automate Lighthouse audits on every deployment.

#### Setup Lighthouse CI

**1. Install:**

```bash
npm install -D @lhci/cli
```

**2. Configure:**

```javascript
// lighthouserc.js
module.exports = {
  ci: {
    collect: {
      url: [
        'https://offerlens.com',
        'https://offerlens.com/upload',
        'https://offerlens.com/results',
      ],
      numberOfRuns: 3,
    },
    assert: {
      preset: 'lighthouse:recommended',
      assertions: {
        'categories:performance': ['error', { minScore: 0.9 }],
        'categories:accessibility': ['error', { minScore: 0.95 }],
        'categories:best-practices': ['error', { minScore: 0.95 }],
        'categories:seo': ['error', { minScore: 0.95 }],
      },
    },
    upload: {
      target: 'temporary-public-storage',
    },
  },
};
```

**3. Add Script:**

```json
// package.json
{
  "scripts": {
    "lighthouse": "lhci autorun",
    "lighthouse:prod": "lhci autorun --config=lighthouserc.prod.js"
  }
}
```

**4. GitHub Action:**

```yaml
# .github/workflows/lighthouse.yml
name: Lighthouse CI

on:
  pull_request:
    branches: [main]

jobs:
  lighthouse:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build
      - run: npm run lighthouse
```

### WebPageTest

Run detailed performance tests.

#### Setup WebPageTest

1. **Go to [webpagetest.org](https://www.webpagetest.org)**

2. **Configure Test:**
   ```
   URL: https://offerlens.com
   Location: Multiple locations
   Browser: Chrome
   Connection: 4G
   Number of Tests: 3
   ```

3. **Run Test**
   - Click **Start Test**
   - Wait for results (~5 minutes)

4. **Review Results:**
   - Load time
   - First byte
   - Start render
   - Speed index
   - Waterfall chart

#### Automated Testing

Use WebPageTest API:

```bash
npm install webpagetest
```

```javascript
// scripts/webpagetest.js
const WebPageTest = require('webpagetest');
const wpt = new WebPageTest('www.webpagetest.org', process.env.WPT_API_KEY);

wpt.runTest('https://offerlens.com', {
  location: 'Dulles:Chrome',
  connectivity: '4G',
  runs: 3,
}, (err, result) => {
  if (err) throw err;
  console.log('Test ID:', result.data.testId);
  console.log('Results:', result.data.summary);
});
```

## Alert Configuration

### Alert Channels

#### Email Alerts

**Configure in each service:**
- Vercel: Settings → Notifications
- UptimeRobot: Alert Contacts → Email
- Sentry: Settings → Alerts → Email

**Email for:**
- Deployment failures
- Critical errors
- Downtime
- Performance degradation

#### Slack Alerts

**Setup Slack Integration:**

1. **Create Slack App**
   - Go to [api.slack.com/apps](https://api.slack.com/apps)
   - Click **Create New App**
   - Choose **From scratch**

2. **Enable Incoming Webhooks**
   - Go to **Incoming Webhooks**
   - Toggle **Activate Incoming Webhooks**
   - Click **Add New Webhook to Workspace**
   - Select channel (e.g., #deployments)

3. **Get Webhook URL**
   - Copy webhook URL
   - Add to monitoring services

**Configure Services:**

**Vercel:**
- Settings → Integrations → Slack
- Connect workspace
- Choose channels

**UptimeRobot:**
- Alert Contacts → Add Alert Contact
- Type: Webhook
- URL: Slack webhook URL

**Sentry:**
- Settings → Integrations → Slack
- Connect workspace
- Configure alert rules

**Slack for:**
- Deployment notifications
- Error summaries
- Performance alerts
- Uptime alerts

#### SMS Alerts

**Configure for critical alerts only:**
- Complete site outage
- Security incidents
- Data loss

**Services:**
- UptimeRobot: Built-in SMS
- Twilio: Custom integration
- PagerDuty: On-call rotation

### Alert Rules

#### Deployment Alerts

**Successful Deployment:**
```
Channel: Slack #deployments
Message: ✅ Deployed to production
Details: Commit, author, changes
```

**Failed Deployment:**
```
Channel: Email + Slack
Message: ❌ Deployment failed
Details: Error logs, commit
Action: Investigate immediately
```

#### Error Alerts

**New Error Type:**
```
Channel: Slack #errors
Message: 🐛 New error detected
Details: Error message, stack trace
Action: Investigate within 1 hour
```

**Error Rate Spike:**
```
Channel: Email + Slack
Message: 🚨 Error rate spike
Details: Current rate, baseline
Action: Investigate immediately
```

#### Performance Alerts

**Performance Degradation:**
```
Channel: Slack #performance
Message: ⚠️ Performance degraded
Details: Metric, current value, threshold
Action: Investigate within 4 hours
```

**Core Web Vitals Poor:**
```
Channel: Email
Message: 📊 Core Web Vitals poor
Details: LCP, FID, CLS values
Action: Optimize within 1 week
```

#### Uptime Alerts

**Site Down:**
```
Channel: Email + SMS + Slack
Message: 🔴 Site is down
Details: Response code, error
Action: Investigate immediately
```

**Site Slow:**
```
Channel: Slack
Message: 🐌 Site is slow
Details: Response time
Action: Investigate within 1 hour
```

## Dashboard Setup

### Vercel Dashboard

**Access:** [vercel.com/dashboard](https://vercel.com/dashboard)

**Key Sections:**
- **Overview**: Deployment status, analytics summary
- **Deployments**: All deployments, logs
- **Analytics**: Traffic, visitors, pages
- **Speed Insights**: Core Web Vitals, performance
- **Logs**: Runtime logs, errors

**Daily Review:**
- Check deployment status
- Review error rate
- Check performance metrics
- Review top pages

### Custom Dashboard

Create custom dashboard with key metrics:

**Tools:**
- Grafana (self-hosted)
- Datadog (paid)
- New Relic (paid)
- Custom dashboard (React app)

**Metrics to Display:**
- Uptime (last 24h, 7d, 30d)
- Error rate (last 24h)
- Performance score (last 7d)
- Core Web Vitals (current)
- Deployment frequency (last 30d)
- Active users (current)

**Example Dashboard Layout:**

```
┌─────────────────────────────────────────────────────────────┐
│  OfferLens Monitoring Dashboard                             │
├─────────────────────────────────────────────────────────────┤
│  Uptime                                                      │
│  ████████████████████████████████████████████ 99.95%        │
│                                                              │
│  Error Rate                                                  │
│  ██ 0.5%                                                     │
│                                                              │
│  Performance Score                                           │
│  ████████████████████████████████████ 92                    │
│                                                              │
│  Core Web Vitals                                             │
│  LCP: 2.1s  FID: 45ms  CLS: 0.05                            │
│                                                              │
│  Active Users                                                │
│  1,234                                                       │
└─────────────────────────────────────────────────────────────┘
```

## Incident Response

### Incident Workflow

```
Alert Received
     │
     ▼
Assess Severity
     │
     ├─── P0/P1 ──→ Immediate Response
     │                    │
     │                    ▼
     │              Investigate
     │                    │
     │                    ▼
     │              Mitigate
     │                    │
     │                    ▼
     │              Resolve
     │                    │
     │                    ▼
     │              Post-Mortem
     │
     └─── P2/P3 ──→ Schedule Fix
```

### Response Times

| Severity | Response Time | Resolution Time |
|----------|---------------|-----------------|
| P0 - Critical | < 15 minutes | < 2 hours |
| P1 - High | < 1 hour | < 8 hours |
| P2 - Medium | < 4 hours | < 2 days |
| P3 - Low | < 24 hours | < 1 week |

### Escalation

**Level 1: On-Call Engineer**
- Receives all alerts
- Investigates issues
- Resolves P2/P3 issues
- Escalates P0/P1 issues

**Level 2: Team Lead**
- Receives P0/P1 escalations
- Coordinates response
- Makes rollback decisions
- Communicates with stakeholders

**Level 3: Engineering Manager**
- Receives critical escalations
- Allocates resources
- Communicates with executives
- Approves emergency changes

## Best Practices

### Monitoring Best Practices

1. **Set Realistic Thresholds**
   - Based on historical data
   - Account for normal variation
   - Avoid alert fatigue

2. **Monitor User Impact**
   - Focus on user-facing metrics
   - Track business metrics
   - Measure actual impact

3. **Review Regularly**
   - Daily error checks
   - Weekly metric reviews
   - Monthly trend analysis

4. **Act on Alerts**
   - Don't ignore alerts
   - Investigate promptly
   - Adjust thresholds if needed

5. **Document Everything**
   - Alert configurations
   - Response procedures
   - Incident reports

### Alert Best Practices

1. **Actionable Alerts**
   - Clear what's wrong
   - Clear what to do
   - Include relevant context

2. **Right Channel**
   - Critical: Email + SMS
   - Important: Email + Slack
   - Info: Slack only

3. **Avoid Alert Fatigue**
   - Don't over-alert
   - Group related alerts
   - Adjust thresholds

4. **Test Alerts**
   - Verify alerts work
   - Test all channels
   - Update contact info

## Conclusion

Proper monitoring and alerting are essential for maintaining a reliable, performant application. This guide provides a comprehensive setup that covers:

- ✅ Availability monitoring
- ✅ Performance tracking
- ✅ Error detection
- ✅ User analytics
- ✅ Alert configuration
- ✅ Incident response

Follow this guide to ensure your application is well-monitored and issues are detected and resolved quickly.

---

**Last Updated:** December 2024
**Version:** 1.0
**Owner:** DevOps Team
