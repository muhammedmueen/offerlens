# Monitoring and Alerting Guide

This guide covers monitoring, logging, and alerting setup for OfferLens in production.

## Table of Contents

- [Overview](#overview)
- [Railway Monitoring](#railway-monitoring)
- [Vercel Analytics](#vercel-analytics)
- [Health Checks](#health-checks)
- [Error Tracking with Sentry](#error-tracking-with-sentry)
- [Uptime Monitoring](#uptime-monitoring)
- [Log Management](#log-management)
- [Metrics and Dashboards](#metrics-and-dashboards)
- [Alerting](#alerting)
- [Performance Monitoring](#performance-monitoring)

## Overview

OfferLens monitoring strategy:

1. **Application Health**: Health check endpoints
2. **Error Tracking**: Sentry for error reporting
3. **Uptime Monitoring**: UptimeRobot or Pingdom
4. **Logs**: Railway logs + optional aggregation
5. **Metrics**: Railway metrics + custom tracking
6. **Frontend Analytics**: Vercel Analytics

## Railway Monitoring

Railway provides built-in monitoring for your backend service.

### Accessing Railway Metrics

1. Go to your Railway project
2. Click on your backend service
3. Navigate to "Metrics" tab

### Available Metrics

- **CPU Usage**: Percentage of CPU utilized
- **Memory Usage**: RAM consumption
- **Network**: Inbound/outbound traffic
- **Disk I/O**: Read/write operations
- **Request Count**: Number of HTTP requests
- **Response Time**: Average response time

### Setting Up Alerts

Railway Pro plan includes alerting:

1. Go to project settings
2. Navigate to "Notifications"
3. Configure alerts for:
   - High CPU usage (>80%)
   - High memory usage (>90%)
   - Service crashes
   - Deployment failures

### Viewing Logs

Real-time logs in Railway:

```bash
# In Railway dashboard
Service → Logs → View real-time logs

# Or use Railway CLI
railway logs
railway logs --follow
```

## Vercel Analytics

Vercel provides analytics for your frontend.

### Enabling Analytics

1. Go to your Vercel project
2. Navigate to "Analytics" tab
3. Enable "Web Analytics"

### Metrics Tracked

- **Page Views**: Total page views
- **Unique Visitors**: Unique users
- **Top Pages**: Most visited pages
- **Referrers**: Traffic sources
- **Devices**: Desktop vs mobile
- **Browsers**: Browser distribution
- **Countries**: Geographic distribution

### Core Web Vitals

Vercel tracks performance metrics:

- **LCP** (Largest Contentful Paint): Loading performance
- **FID** (First Input Delay): Interactivity
- **CLS** (Cumulative Layout Shift): Visual stability

### Setting Up Alerts

Vercel Pro plan includes performance alerts:

1. Go to project settings
2. Navigate to "Alerts"
3. Configure thresholds for Core Web Vitals

## Health Checks

### Backend Health Endpoint

The backend provides health check endpoints:

```typescript
// GET /api/v1/health
{
  "status": "ok",
  "timestamp": "2024-12-12T10:00:00.000Z",
  "uptime": 3600,
  "environment": "production"
}

// GET /api/v1/health/ready
{
  "status": "ready",
  "checks": {
    "database": "ok",
    "redis": "ok"
  }
}
```

### Railway Health Checks

Configure in Railway:

1. Go to service settings
2. Navigate to "Health Check"
3. Set:
   - **Path**: `/api/v1/health`
   - **Interval**: 30 seconds
   - **Timeout**: 5 seconds
   - **Retries**: 3

Railway will:
- Monitor endpoint every 30 seconds
- Restart service if health check fails
- Alert you of failures

### Custom Health Checks

Add more checks to `/api/v1/health/ready`:

```typescript
// src/controllers/health.controller.ts
export const readinessCheck = async (req: Request, res: Response) => {
  const checks = {
    database: await checkDatabase(),
    redis: await checkRedis(),
    diskSpace: await checkDiskSpace(),
    externalAPI: await checkExternalAPI(),
  };

  const allHealthy = Object.values(checks).every(status => status === 'ok');

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'ready' : 'not_ready',
    checks,
  });
};
```

## Error Tracking with Sentry

Sentry provides real-time error tracking and monitoring.

### Setup

1. **Sign up at [Sentry.io](https://sentry.io)**
2. **Create new project** (Node.js)
3. **Get DSN** (Data Source Name)

### Installation

```bash
npm install @sentry/node @sentry/profiling-node
```

### Configuration

```typescript
// src/index.ts
import * as Sentry from '@sentry/node';
import { ProfilingIntegration } from '@sentry/profiling-node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0, // Adjust for production
  profilesSampleRate: 1.0,
  integrations: [
    new ProfilingIntegration(),
  ],
});

// Error handler middleware
app.use(Sentry.Handlers.errorHandler());
```

### Environment Variable

Add to Railway:

```bash
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
```

### Features

- **Error Tracking**: Automatic error capture
- **Performance Monitoring**: Transaction tracking
- **Release Tracking**: Track deployments
- **User Context**: Associate errors with users
- **Breadcrumbs**: Event trail before errors
- **Source Maps**: Original source code in stack traces

### Alerts

Configure in Sentry:

1. Go to project settings
2. Navigate to "Alerts"
3. Create alert rules:
   - New error types
   - Error rate spikes
   - Performance degradation

### Integration with Railway

Add Sentry release tracking:

```json
// package.json
{
  "scripts": {
    "sentry:release": "sentry-cli releases new $RAILWAY_GIT_COMMIT_SHA && sentry-cli releases set-commits $RAILWAY_GIT_COMMIT_SHA --auto"
  }
}
```

## Uptime Monitoring

Monitor service availability with external tools.

### UptimeRobot (Free)

1. **Sign up at [UptimeRobot.com](https://uptimerobot.com)**
2. **Add new monitor**:
   - Type: HTTP(s)
   - URL: `https://your-backend.railway.app/api/v1/health`
   - Interval: 5 minutes
3. **Configure alerts**:
   - Email notifications
   - SMS (paid)
   - Slack/Discord webhooks

### Pingdom (Paid)

More advanced monitoring:

1. **Sign up at [Pingdom.com](https://www.pingdom.com)**
2. **Create uptime check**
3. **Configure**:
   - Check interval: 1 minute
   - Locations: Multiple regions
   - Alert contacts

### Better Uptime (Modern)

1. **Sign up at [BetterUptime.com](https://betteruptime.com)**
2. **Create monitor**
3. **Features**:
   - Status pages
   - Incident management
   - On-call scheduling
   - Phone call alerts

### Status Page

Create a public status page:

**Option 1: Better Uptime**
- Automatic status page
- Custom domain support
- Incident history

**Option 2: Statuspage.io**
- Atlassian product
- More customization
- Component-level status

**Option 3: Self-hosted**
- Use [Upptime](https://upptime.js.org)
- GitHub Actions based
- Free and open source

## Log Management

### Railway Logs

Railway stores logs for 7 days (Hobby) or 30 days (Pro).

**Viewing logs:**

```bash
# Railway CLI
railway logs
railway logs --follow
railway logs --tail 100

# Filter by service
railway logs --service backend
```

### Log Aggregation (Optional)

For longer retention and advanced search:

#### Papertrail

1. **Sign up at [Papertrail](https://papertrailapp.com)**
2. **Get log destination** (host:port)
3. **Configure Winston**:

```typescript
// src/utils/logger.ts
import winston from 'winston';
import 'winston-papertrail';

const papertrail = new winston.transports.Papertrail({
  host: process.env.PAPERTRAIL_HOST,
  port: parseInt(process.env.PAPERTRAIL_PORT),
  hostname: 'offerlens-backend',
  program: 'api',
});

const logger = winston.createLogger({
  transports: [
    papertrail,
    // ... other transports
  ],
});
```

#### Logtail

Modern log management:

```bash
npm install @logtail/node @logtail/winston
```

```typescript
import { Logtail } from '@logtail/node';
import { LogtailTransport } from '@logtail/winston';

const logtail = new Logtail(process.env.LOGTAIL_TOKEN);

const logger = winston.createLogger({
  transports: [
    new LogtailTransport(logtail),
  ],
});
```

### Structured Logging

Use structured logs for better searchability:

```typescript
logger.info('User action', {
  action: 'analyze_offer',
  userId: 'anonymous',
  duration: 1234,
  success: true,
});
```

## Metrics and Dashboards

### Custom Metrics

Track business metrics:

```typescript
// src/services/metrics.service.ts
export class MetricsService {
  async trackAnalysis(success: boolean, duration: number) {
    await prisma.analyticsEvent.create({
      data: {
        eventType: 'offer_analysis',
        metadata: {
          success,
          duration,
          timestamp: new Date(),
        },
      },
    });
  }

  async getMetrics(startDate: Date, endDate: Date) {
    const analyses = await prisma.analyticsEvent.count({
      where: {
        eventType: 'offer_analysis',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    return { analyses };
  }
}
```

### Grafana Dashboard (Advanced)

For advanced visualization:

1. **Set up Prometheus** to scrape metrics
2. **Install Grafana**
3. **Create dashboards** for:
   - Request rate
   - Error rate
   - Response time
   - Database queries
   - Cache hit rate

### Simple Dashboard

Create an admin dashboard in your app:

```typescript
// GET /api/v1/admin/metrics
{
  "today": {
    "analyses": 150,
    "featureRequests": 5,
    "errors": 2
  },
  "week": {
    "analyses": 1050,
    "featureRequests": 23,
    "errors": 8
  }
}
```

## Alerting

### Alert Channels

Set up multiple channels:

1. **Email**: Primary alerts
2. **Slack**: Team notifications
3. **SMS**: Critical alerts only
4. **PagerDuty**: On-call rotation

### Alert Rules

Configure alerts for:

#### Critical (Immediate Response)

- Service down (health check fails)
- Database connection lost
- Redis connection lost
- Error rate > 10%
- Response time > 5 seconds

#### Warning (Review Soon)

- Error rate > 5%
- Response time > 2 seconds
- Memory usage > 80%
- CPU usage > 80%
- Disk space < 20%

#### Info (Monitor)

- New deployment
- Configuration change
- Unusual traffic pattern

### Slack Integration

Set up Slack webhooks:

```typescript
// src/utils/alerts.ts
export async function sendSlackAlert(message: string, severity: 'critical' | 'warning' | 'info') {
  const color = {
    critical: 'danger',
    warning: 'warning',
    info: 'good',
  }[severity];

  await fetch(process.env.SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      attachments: [{
        color,
        text: message,
        footer: 'OfferLens Monitoring',
        ts: Math.floor(Date.now() / 1000),
      }],
    }),
  });
}
```

### Discord Integration

Similar to Slack:

```typescript
export async function sendDiscordAlert(message: string) {
  await fetch(process.env.DISCORD_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: message,
      username: 'OfferLens Monitor',
    }),
  });
}
```

## Performance Monitoring

### Response Time Tracking

Already implemented in the backend:

```typescript
// src/middleware/requestLogger.ts
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    logger.info('Request completed', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration,
    });
    
    // Alert if slow
    if (duration > 2000) {
      sendSlackAlert(`Slow request: ${req.path} took ${duration}ms`, 'warning');
    }
  });
  
  next();
});
```

### Database Query Performance

Monitor slow queries:

```typescript
// Prisma middleware
prisma.$use(async (params, next) => {
  const start = Date.now();
  const result = await next(params);
  const duration = Date.now() - start;
  
  if (duration > 1000) {
    logger.warn('Slow query', {
      model: params.model,
      action: params.action,
      duration,
    });
  }
  
  return result;
});
```

### Cache Performance

Track cache hit rates:

```typescript
// src/services/cache.service.ts
export class CacheService {
  private hits = 0;
  private misses = 0;

  async get<T>(key: string): Promise<T | null> {
    const value = await redis.get(key);
    
    if (value) {
      this.hits++;
    } else {
      this.misses++;
    }
    
    // Log metrics every 100 requests
    if ((this.hits + this.misses) % 100 === 0) {
      const hitRate = this.hits / (this.hits + this.misses);
      logger.info('Cache metrics', {
        hits: this.hits,
        misses: this.misses,
        hitRate: hitRate.toFixed(2),
      });
    }
    
    return value ? JSON.parse(value) : null;
  }
}
```

## Monitoring Checklist

### Initial Setup

- [ ] Configure Railway health checks
- [ ] Set up Sentry error tracking
- [ ] Configure uptime monitoring (UptimeRobot)
- [ ] Enable Vercel Analytics
- [ ] Set up log aggregation (optional)
- [ ] Configure alert channels (email, Slack)

### Regular Monitoring

- [ ] Check error rates daily
- [ ] Review slow queries weekly
- [ ] Analyze traffic patterns weekly
- [ ] Review cache hit rates weekly
- [ ] Check disk space monthly
- [ ] Review and update alert thresholds monthly

### Incident Response

- [ ] Document incident response procedures
- [ ] Set up on-call rotation
- [ ] Create runbooks for common issues
- [ ] Test alert channels regularly
- [ ] Conduct post-mortems after incidents

## Best Practices

1. **Set Realistic Thresholds**: Don't alert on every minor issue
2. **Reduce Alert Fatigue**: Too many alerts = ignored alerts
3. **Test Alerts**: Regularly test that alerts work
4. **Document Runbooks**: Clear steps for common issues
5. **Review Regularly**: Update monitoring as app evolves
6. **Monitor User Experience**: Not just server metrics
7. **Track Business Metrics**: Analyses, feature requests, etc.
8. **Automate Responses**: Auto-restart, auto-scale when possible

## Resources

- [Railway Monitoring Docs](https://docs.railway.app/reference/monitoring)
- [Vercel Analytics Docs](https://vercel.com/docs/analytics)
- [Sentry Docs](https://docs.sentry.io)
- [UptimeRobot Docs](https://uptimerobot.com/api)
- [Winston Logging](https://github.com/winstonjs/winston)

## Support

For monitoring issues:
- Check this documentation
- Review platform documentation
- Contact platform support
- Create GitHub issue if needed
