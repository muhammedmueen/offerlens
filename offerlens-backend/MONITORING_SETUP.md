# Quick Monitoring Setup Guide

This guide helps you set up essential monitoring for OfferLens in 30 minutes.

## Essential Monitoring Stack

1. **Railway Built-in** - Logs and metrics (free)
2. **Vercel Analytics** - Frontend performance (free)
3. **UptimeRobot** - Uptime monitoring (free)
4. **Sentry** - Error tracking (optional, free tier available)

## Step 1: Railway Monitoring (5 minutes)

Already included with Railway! Just configure:

### Enable Health Checks

1. Go to Railway project
2. Click backend service
3. Go to "Settings" → "Health Check"
4. Configure:
   ```
   Path: /api/v1/health
   Interval: 30 seconds
   Timeout: 5 seconds
   Retries: 3
   ```
5. Save

### View Metrics

1. Click backend service
2. Go to "Metrics" tab
3. Monitor:
   - CPU usage
   - Memory usage
   - Network traffic
   - Request count

### View Logs

1. Click backend service
2. Go to "Logs" tab
3. Filter by:
   - Service (backend, postgres, redis)
   - Log level
   - Time range

**Cost**: Free (included with Railway)

## Step 2: Vercel Analytics (5 minutes)

### Enable Analytics

1. Go to Vercel project
2. Click "Analytics" tab
3. Click "Enable Analytics"
4. Choose "Web Analytics" (free)

### View Metrics

Monitor:
- Page views
- Unique visitors
- Core Web Vitals (LCP, FID, CLS)
- Top pages
- Referrers

**Cost**: Free for Hobby plan

## Step 3: UptimeRobot (10 minutes)

Free uptime monitoring with email alerts.

### Sign Up

1. Go to [uptimerobot.com](https://uptimerobot.com)
2. Click "Sign Up Free"
3. Verify email

### Add Backend Monitor

1. Click "Add New Monitor"
2. Configure:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: OfferLens Backend
   URL: https://your-backend.railway.app/api/v1/health
   Monitoring Interval: 5 minutes
   ```
3. Click "Create Monitor"

### Add Frontend Monitor

1. Click "Add New Monitor"
2. Configure:
   ```
   Monitor Type: HTTP(s)
   Friendly Name: OfferLens Frontend
   URL: https://your-app.vercel.app
   Monitoring Interval: 5 minutes
   ```
3. Click "Create Monitor"

### Configure Alerts

1. Go to "My Settings"
2. Add email for alerts
3. Configure:
   - Alert when down
   - Alert when back up
   - Send summary emails (optional)

### Optional: Slack Integration

1. Create Slack webhook:
   - Go to Slack → Apps → Incoming Webhooks
   - Add to your channel
   - Copy webhook URL

2. In UptimeRobot:
   - Go to "My Settings" → "Alert Contacts"
   - Add "Web-Hook"
   - Paste Slack webhook URL

**Cost**: Free (50 monitors, 5-minute intervals)

## Step 4: Sentry Error Tracking (10 minutes)

Optional but highly recommended for production.

### Sign Up

1. Go to [sentry.io](https://sentry.io)
2. Sign up (free tier: 5,000 errors/month)
3. Create organization

### Create Backend Project

1. Click "Create Project"
2. Choose "Node.js"
3. Name: "offerlens-backend"
4. Copy DSN (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

### Install Sentry in Backend

```bash
cd offerlens-backend
npm install @sentry/node @sentry/profiling-node
```

### Configure Backend

```typescript
// src/index.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0,
  profilesSampleRate: 1.0,
  integrations: [
    new ProfilingIntegration(),
  ],
});

// Add error handler before other error middleware
app.use(Sentry.Handlers.errorHandler());
```

### Add Environment Variable

In Railway:
```bash
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### Create Frontend Project

1. Click "Create Project"
2. Choose "React"
3. Name: "offerlens-frontend"
4. Copy DSN

### Install Sentry in Frontend

```bash
cd offerlens-frontend
npm install @sentry/react
```

### Configure Frontend

```typescript
// src/main.tsx
import * as Sentry from '@sentry/react';

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  integrations: [
    Sentry.browserTracingIntegration(),
    Sentry.replayIntegration(),
  ],
  tracesSampleRate: 1.0,
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,
});
```

### Add Environment Variable

In Vercel:
```bash
VITE_SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### Configure Alerts

1. Go to Sentry project
2. Click "Alerts"
3. Create alert rule:
   ```
   Name: New Error Types
   Condition: A new issue is created
   Action: Send email notification
   ```

**Cost**: Free tier (5,000 errors/month)

## Monitoring Dashboard

Create a simple monitoring dashboard:

### Option 1: Notion/Confluence Page

Create a page with:
- Links to Railway metrics
- Links to Vercel analytics
- Links to UptimeRobot dashboard
- Links to Sentry projects
- On-call schedule
- Incident response procedures

### Option 2: Custom Dashboard

Create a simple HTML page:

```html
<!DOCTYPE html>
<html>
<head>
  <title>OfferLens Monitoring</title>
  <style>
    body { font-family: Arial; padding: 20px; }
    .card { border: 1px solid #ddd; padding: 20px; margin: 10px 0; }
    .status-ok { color: green; }
    .status-error { color: red; }
  </style>
</head>
<body>
  <h1>OfferLens Monitoring Dashboard</h1>
  
  <div class="card">
    <h2>Backend</h2>
    <p>Status: <span class="status-ok">✓ Operational</span></p>
    <a href="https://railway.app/project/your-project">Railway Dashboard</a>
  </div>
  
  <div class="card">
    <h2>Frontend</h2>
    <p>Status: <span class="status-ok">✓ Operational</span></p>
    <a href="https://vercel.com/your-project">Vercel Dashboard</a>
  </div>
  
  <div class="card">
    <h2>Uptime</h2>
    <a href="https://uptimerobot.com">UptimeRobot Dashboard</a>
  </div>
  
  <div class="card">
    <h2>Errors</h2>
    <a href="https://sentry.io">Sentry Dashboard</a>
  </div>
</body>
</html>
```

## Alert Configuration

### Critical Alerts (Immediate Response)

Configure these to alert immediately:

1. **Service Down**
   - UptimeRobot: Email + Slack
   - Response: Immediate

2. **High Error Rate**
   - Sentry: Email + Slack
   - Threshold: > 10 errors/minute
   - Response: Within 15 minutes

3. **Database Connection Lost**
   - Railway: Email
   - Response: Immediate

### Warning Alerts (Review Soon)

Configure these for review:

1. **Slow Response Time**
   - Railway metrics
   - Threshold: > 2 seconds
   - Response: Within 1 hour

2. **High Memory Usage**
   - Railway metrics
   - Threshold: > 80%
   - Response: Within 1 hour

3. **New Error Types**
   - Sentry
   - Response: Within 24 hours

## Daily Monitoring Routine

### Morning Check (5 minutes)

```bash
# 1. Check UptimeRobot
# - All monitors green?
# - Any downtime overnight?

# 2. Check Sentry
# - Any new errors?
# - Error rate normal?

# 3. Check Railway
# - Services running?
# - Any deployment issues?

# 4. Check Vercel
# - Frontend deployed?
# - Any build failures?
```

### Weekly Review (30 minutes)

```bash
# 1. Review metrics
# - Traffic trends
# - Error trends
# - Performance trends

# 2. Review alerts
# - False positives?
# - Missed issues?
# - Adjust thresholds?

# 3. Review logs
# - Any warnings?
# - Any patterns?

# 4. Update documentation
# - New issues discovered?
# - New solutions found?
```

## Testing Alerts

Test your monitoring setup:

### Test 1: Backend Down

```bash
# Pause backend service in Railway
# Verify:
# - UptimeRobot sends alert
# - You receive email
# - Slack notification (if configured)

# Resume service
# Verify:
# - UptimeRobot sends recovery alert
```

### Test 2: Error Tracking

```typescript
// Add test error to backend
app.get('/api/v1/test-error', () => {
  throw new Error('Test error for monitoring');
});

// Trigger error
curl https://your-backend.railway.app/api/v1/test-error

// Verify:
// - Error appears in Sentry
// - Alert sent (if configured)
```

### Test 3: Performance Alert

```bash
# Simulate slow endpoint
# Check Railway metrics
# Verify slow response time is logged
```

## Monitoring Checklist

- [ ] Railway health checks enabled
- [ ] Railway metrics reviewed
- [ ] Vercel Analytics enabled
- [ ] UptimeRobot monitors created
- [ ] UptimeRobot alerts configured
- [ ] Sentry backend project created
- [ ] Sentry frontend project created
- [ ] Sentry alerts configured
- [ ] Alert channels tested
- [ ] Monitoring dashboard created
- [ ] Daily check routine established
- [ ] Weekly review scheduled
- [ ] Team trained on monitoring tools
- [ ] Incident response plan documented

## Cost Summary

| Tool | Free Tier | Paid Tier | Recommended |
|------|-----------|-----------|-------------|
| Railway | Included | Included | ✅ Required |
| Vercel Analytics | Included | $20/mo | ✅ Required |
| UptimeRobot | 50 monitors | $7/mo | ✅ Required |
| Sentry | 5K errors/mo | $26/mo | ⭐ Recommended |

**Total Cost**: $0-7/month (free tier sufficient for small apps)

## Next Steps

After setup:

1. ✅ Monitor for 1 week
2. ✅ Adjust alert thresholds
3. ✅ Document any issues
4. ✅ Train team on tools
5. ✅ Create runbooks for common issues
6. ✅ Schedule regular reviews
7. ✅ Consider additional tools as you scale

## Advanced Monitoring (Future)

As you grow, consider:

- **Grafana**: Custom dashboards
- **Prometheus**: Metrics collection
- **PagerDuty**: On-call management
- **Datadog**: All-in-one monitoring
- **New Relic**: APM and monitoring

## Support

For monitoring setup help:
- Railway Discord: [discord.gg/railway](https://discord.gg/railway)
- Vercel Discord: [vercel.com/discord](https://vercel.com/discord)
- Sentry Docs: [docs.sentry.io](https://docs.sentry.io)
- UptimeRobot Support: [uptimerobot.com/support](https://uptimerobot.com/support)

## Resources

- [MONITORING.md](./MONITORING.md) - Comprehensive monitoring guide
- [Railway Monitoring Docs](https://docs.railway.app/reference/monitoring)
- [Vercel Analytics Docs](https://vercel.com/docs/analytics)
- [Sentry Docs](https://docs.sentry.io)
- [UptimeRobot Docs](https://uptimerobot.com/api)
