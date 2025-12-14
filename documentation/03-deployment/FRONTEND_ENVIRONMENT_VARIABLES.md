# Environment Variables Reference

Complete reference for all environment variables used in the OfferLens Next.js frontend.

## Table of Contents

- [Overview](#overview)
- [Required Variables](#required-variables)
- [Optional Variables](#optional-variables)
- [Environment-Specific Configuration](#environment-specific-configuration)
- [Vercel Configuration](#vercel-configuration)
- [Security Best Practices](#security-best-practices)
- [Troubleshooting](#troubleshooting)

## Overview

### Variable Naming Convention

Next.js environment variables follow specific naming conventions:

**Client-Side Variables:**
- Prefix: `NEXT_PUBLIC_`
- Exposed to browser
- Included in client bundle
- Use for non-sensitive data only

**Server-Side Variables:**
- No prefix required
- Only available on server
- Not exposed to browser
- Use for sensitive data (API keys, secrets)

**Example:**
```env
# Client-side (exposed to browser)
NEXT_PUBLIC_API_URL=https://api.offerlens.com

# Server-side (not exposed)
API_SECRET_KEY=secret-key-here
```

### Environment Files

The project uses multiple environment files:

| File | Purpose | Committed to Git |
|------|---------|------------------|
| `.env.local` | Local development | ❌ No |
| `.env.development` | Development defaults | ✅ Yes |
| `.env.production` | Production template | ✅ Yes (no secrets) |
| `.env.staging` | Staging template | ✅ Yes (no secrets) |
| `.env.example` | Documentation | ✅ Yes |

**Load Order:**
1. `.env.local` (highest priority)
2. `.env.[environment]` (e.g., `.env.production`)
3. `.env`

## Required Variables

### NEXT_PUBLIC_API_URL

**Description:** Backend API base URL

**Type:** Client-side (exposed to browser)

**Format:** URL without trailing slash or `/api/v1` suffix

**Examples:**
```env
# Development
NEXT_PUBLIC_API_URL=http://localhost:3001

# Staging
NEXT_PUBLIC_API_URL=https://offerlens-backend-staging.railway.app

# Production
NEXT_PUBLIC_API_URL=https://api.offerlens.com
```

**Usage:**
```typescript
// lib/api/client.ts
const apiClient = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
});
```

**Validation:**
- Must be a valid URL
- Must use HTTPS in production
- Must not include trailing slash
- Must not include `/api/v1` suffix (handled by client)

**Common Issues:**
- ❌ `https://api.offerlens.com/` (trailing slash)
- ❌ `https://api.offerlens.com/api/v1` (includes suffix)
- ✅ `https://api.offerlens.com` (correct)

### NEXT_PUBLIC_APP_URL

**Description:** Frontend application URL

**Type:** Client-side (exposed to browser)

**Format:** URL without trailing slash

**Examples:**
```env
# Development
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Staging
NEXT_PUBLIC_APP_URL=https://offerlens-staging.vercel.app

# Production
NEXT_PUBLIC_APP_URL=https://offerlens.com
```

**Usage:**
```typescript
// Used for canonical URLs, social sharing, redirects
const canonicalUrl = `${process.env.NEXT_PUBLIC_APP_URL}/upload`;
```

**Validation:**
- Must be a valid URL
- Must use HTTPS in production
- Must not include trailing slash
- Must match actual deployment URL

## Optional Variables

### NEXT_PUBLIC_ENABLE_ANALYTICS

**Description:** Enable/disable analytics tracking

**Type:** Client-side (exposed to browser)

**Format:** Boolean string (`true` or `false`)

**Default:** `false`

**Examples:**
```env
# Development (disable)
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Staging (disable)
NEXT_PUBLIC_ENABLE_ANALYTICS=false

# Production (enable)
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

**Usage:**
```typescript
// lib/analytics.ts
export function trackEvent(event: string) {
  if (process.env.NEXT_PUBLIC_ENABLE_ANALYTICS === 'true') {
    // Track event
  }
}
```

**Validation:**
- Must be `true` or `false` (string)
- Case-sensitive

### NEXT_PUBLIC_VERCEL_ANALYTICS_ID

**Description:** Vercel Analytics project ID

**Type:** Client-side (exposed to browser)

**Format:** String (alphanumeric)

**Default:** Auto-detected by Vercel

**Examples:**
```env
# Usually not needed (auto-detected)
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=abc123xyz

# Leave empty to use default
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=
```

**Usage:**
```typescript
// Automatically used by @vercel/analytics
import { Analytics } from '@vercel/analytics/react';

<Analytics id={process.env.NEXT_PUBLIC_VERCEL_ANALYTICS_ID} />
```

**Notes:**
- Optional: Vercel auto-detects project ID
- Only needed for custom analytics setup
- Get from Vercel dashboard if needed

### NEXT_PUBLIC_ENABLE_FORUM

**Description:** Enable/disable forum feature

**Type:** Client-side (exposed to browser)

**Format:** Boolean string (`true` or `false`)

**Default:** `true`

**Examples:**
```env
# Enable forum
NEXT_PUBLIC_ENABLE_FORUM=true

# Disable forum
NEXT_PUBLIC_ENABLE_FORUM=false
```

**Usage:**
```typescript
// components/ui/navbar.tsx
{process.env.NEXT_PUBLIC_ENABLE_FORUM === 'true' && (
  <Link href="/forum">Forum</Link>
)}
```

**Use Cases:**
- Feature flagging
- Gradual rollout
- A/B testing
- Maintenance mode

### NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS

**Description:** Enable/disable feature request form

**Type:** Client-side (exposed to browser)

**Format:** Boolean string (`true` or `false`)

**Default:** `true`

**Examples:**
```env
# Enable feature requests
NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS=true

# Disable feature requests
NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS=false
```

**Usage:**
```typescript
// app/feature-request/page.tsx
if (process.env.NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS !== 'true') {
  notFound();
}
```

### NEXT_PUBLIC_SENTRY_DSN

**Description:** Sentry error tracking DSN

**Type:** Client-side (exposed to browser)

**Format:** Sentry DSN URL

**Default:** Empty (error tracking disabled)

**Examples:**
```env
# Production
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx

# Development (disable)
NEXT_PUBLIC_SENTRY_DSN=
```

**Usage:**
```typescript
// sentry.client.config.ts
Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
});
```

**Notes:**
- Get from Sentry dashboard
- Safe to expose (public DSN)
- Leave empty to disable error tracking

### NEXT_PUBLIC_SENTRY_ENVIRONMENT

**Description:** Sentry environment name

**Type:** Client-side (exposed to browser)

**Format:** String (development, staging, production)

**Default:** `development`

**Examples:**
```env
# Development
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development

# Staging
NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging

# Production
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
```

**Usage:**
```typescript
// sentry.client.config.ts
Sentry.init({
  environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT,
});
```

### NEXT_PUBLIC_DEBUG

**Description:** Enable debug logging

**Type:** Client-side (exposed to browser)

**Format:** Boolean string (`true` or `false`)

**Default:** `false`

**Examples:**
```env
# Development (enable)
NEXT_PUBLIC_DEBUG=true

# Production (disable)
NEXT_PUBLIC_DEBUG=false
```

**Usage:**
```typescript
// lib/utils/logger.ts
export function debug(message: string) {
  if (process.env.NEXT_PUBLIC_DEBUG === 'true') {
    console.log('[DEBUG]', message);
  }
}
```

**Notes:**
- Enable for troubleshooting
- Disable in production
- Shows additional console logs

### NEXT_PUBLIC_API_TIMEOUT

**Description:** API request timeout in milliseconds

**Type:** Client-side (exposed to browser)

**Format:** Number (milliseconds)

**Default:** `30000` (30 seconds)

**Examples:**
```env
# Default (30 seconds)
NEXT_PUBLIC_API_TIMEOUT=30000

# Longer timeout (60 seconds)
NEXT_PUBLIC_API_TIMEOUT=60000

# Shorter timeout (15 seconds)
NEXT_PUBLIC_API_TIMEOUT=15000
```

**Usage:**
```typescript
// lib/api/client.ts
const apiClient = axios.create({
  timeout: parseInt(process.env.NEXT_PUBLIC_API_TIMEOUT || '30000'),
});
```

**Notes:**
- Adjust based on API response times
- Too short: premature timeouts
- Too long: poor user experience

## Environment-Specific Configuration

### Development (.env.local)

```env
# ============================================
# Development Environment
# ============================================

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Analytics (disabled)
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=

# Feature Flags (all enabled)
NEXT_PUBLIC_ENABLE_FORUM=true
NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS=true

# Error Tracking (disabled)
NEXT_PUBLIC_SENTRY_DSN=
NEXT_PUBLIC_SENTRY_ENVIRONMENT=development

# Debug (enabled)
NEXT_PUBLIC_DEBUG=true

# Performance
NEXT_PUBLIC_API_TIMEOUT=30000
```

### Staging (.env.staging)

```env
# ============================================
# Staging Environment
# ============================================

# API Configuration
NEXT_PUBLIC_API_URL=https://offerlens-backend-staging.railway.app
NEXT_PUBLIC_APP_URL=https://offerlens-staging.vercel.app

# Analytics (disabled)
NEXT_PUBLIC_ENABLE_ANALYTICS=false
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=

# Feature Flags (all enabled for testing)
NEXT_PUBLIC_ENABLE_FORUM=true
NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS=true

# Error Tracking (optional)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_ENVIRONMENT=staging

# Debug (enabled for troubleshooting)
NEXT_PUBLIC_DEBUG=true

# Performance
NEXT_PUBLIC_API_TIMEOUT=30000
```

### Production (.env.production)

```env
# ============================================
# Production Environment
# ============================================

# API Configuration
NEXT_PUBLIC_API_URL=https://api.offerlens.com
NEXT_PUBLIC_APP_URL=https://offerlens.com

# Analytics (enabled)
NEXT_PUBLIC_ENABLE_ANALYTICS=true
NEXT_PUBLIC_VERCEL_ANALYTICS_ID=

# Feature Flags
NEXT_PUBLIC_ENABLE_FORUM=true
NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS=true

# Error Tracking (enabled)
NEXT_PUBLIC_SENTRY_DSN=https://xxx@xxx.ingest.sentry.io/xxx
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production

# Debug (disabled)
NEXT_PUBLIC_DEBUG=false

# Performance
NEXT_PUBLIC_API_TIMEOUT=30000
```

## Vercel Configuration

### Setting Variables in Vercel

#### Via Dashboard

1. **Go to Project Settings**
   - Navigate to your project
   - Click **Settings** tab
   - Click **Environment Variables**

2. **Add Variable**
   - Click **Add**
   - Enter name (e.g., `NEXT_PUBLIC_API_URL`)
   - Enter value (e.g., `https://api.offerlens.com`)
   - Select environments:
     - ✅ Production
     - ✅ Preview
     - ✅ Development

3. **Save**
   - Click **Save**
   - Redeploy for changes to take effect

#### Via CLI

```bash
# Install Vercel CLI
npm install -g vercel

# Login
vercel login

# Add variable
vercel env add NEXT_PUBLIC_API_URL production
# Enter value when prompted

# Pull variables to local
vercel env pull .env.local
```

### Environment Scopes

Vercel supports three environment scopes:

**Production:**
- Used for production deployments
- Triggered by push to `main` branch
- Highest priority

**Preview:**
- Used for preview deployments
- Triggered by PRs and branch pushes
- Medium priority

**Development:**
- Used for local development
- Pulled with `vercel env pull`
- Lowest priority

**Example Configuration:**

| Variable | Production | Preview | Development |
|----------|------------|---------|-------------|
| `NEXT_PUBLIC_API_URL` | `https://api.offerlens.com` | `https://api-staging.offerlens.com` | `http://localhost:3001` |
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `true` | `false` | `false` |
| `NEXT_PUBLIC_DEBUG` | `false` | `true` | `true` |

### Automatic Variables

Vercel automatically provides these variables:

**VERCEL:**
- Value: `1`
- Indicates running on Vercel

**VERCEL_ENV:**
- Values: `production`, `preview`, `development`
- Current environment

**VERCEL_URL:**
- Value: Deployment URL
- Unique per deployment

**VERCEL_GIT_COMMIT_SHA:**
- Value: Git commit hash
- Useful for versioning

**Usage:**
```typescript
// Detect environment
const isProduction = process.env.VERCEL_ENV === 'production';
const isPreview = process.env.VERCEL_ENV === 'preview';

// Get deployment URL
const deploymentUrl = process.env.VERCEL_URL;
```

## Security Best Practices

### Do's

✅ **Use NEXT_PUBLIC_ for non-sensitive data only**
```env
# Safe to expose
NEXT_PUBLIC_API_URL=https://api.offerlens.com
NEXT_PUBLIC_ENABLE_ANALYTICS=true
```

✅ **Use server-side variables for secrets**
```env
# Not exposed to browser
API_SECRET_KEY=secret-key-here
DATABASE_URL=postgresql://...
```

✅ **Set variables in Vercel dashboard**
- Never commit secrets to git
- Use Vercel dashboard for production values
- Different values per environment

✅ **Validate environment variables**
```typescript
// lib/config.ts
const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL,
};

if (!config.apiUrl) {
  throw new Error('NEXT_PUBLIC_API_URL is required');
}

export default config;
```

✅ **Use .env.example for documentation**
```env
# .env.example
NEXT_PUBLIC_API_URL=http://localhost:3001
NEXT_PUBLIC_ENABLE_ANALYTICS=false
```

### Don'ts

❌ **Don't commit .env.local**
```bash
# .gitignore
.env.local
.env*.local
```

❌ **Don't expose secrets with NEXT_PUBLIC_**
```env
# BAD: Exposed to browser
NEXT_PUBLIC_API_SECRET=secret-key

# GOOD: Server-side only
API_SECRET=secret-key
```

❌ **Don't hardcode values**
```typescript
// BAD
const apiUrl = 'https://api.offerlens.com';

// GOOD
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

❌ **Don't use production values in development**
```env
# BAD: Using production API in development
NEXT_PUBLIC_API_URL=https://api.offerlens.com

# GOOD: Using local API
NEXT_PUBLIC_API_URL=http://localhost:3001
```

### Secret Rotation

Rotate secrets regularly:

1. **Generate new secret**
2. **Update in Vercel dashboard**
3. **Redeploy application**
4. **Verify functionality**
5. **Revoke old secret**

**Frequency:**
- API keys: Every 90 days
- Database passwords: Every 90 days
- JWT secrets: Every 180 days

## Troubleshooting

### Variable Not Defined

**Symptom:**
```
ReferenceError: process is not defined
```

**Cause:**
- Accessing server-side variable in client component
- Missing `NEXT_PUBLIC_` prefix

**Solution:**
```typescript
// BAD: Server-side variable in client
const apiKey = process.env.API_KEY;

// GOOD: Client-side variable
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

### Variable Not Updating

**Symptom:**
- Changed variable in Vercel
- Still seeing old value

**Cause:**
- Need to redeploy after changing variables

**Solution:**
1. Go to Vercel dashboard
2. Click **Deployments**
3. Click **Redeploy** on latest deployment
4. Or push new commit to trigger deployment

### Variable Empty in Production

**Symptom:**
- Variable works locally
- Empty in production

**Cause:**
- Not set in Vercel dashboard
- Set in wrong environment

**Solution:**
1. Check Vercel dashboard
2. Verify variable is set for Production
3. Verify variable name matches exactly
4. Redeploy

### CORS Errors

**Symptom:**
```
Access to XMLHttpRequest blocked by CORS policy
```

**Cause:**
- Backend CORS not configured for frontend URL
- Wrong API URL

**Solution:**
1. Verify `NEXT_PUBLIC_API_URL` is correct
2. Update backend CORS configuration:
   ```env
   # Backend environment
   CORS_ORIGIN=https://offerlens.com
   ```
3. Redeploy backend

### Type Errors

**Symptom:**
```
Property 'NEXT_PUBLIC_API_URL' does not exist on type 'ProcessEnv'
```

**Cause:**
- Missing TypeScript declarations

**Solution:**
```typescript
// env.d.ts
declare namespace NodeJS {
  interface ProcessEnv {
    NEXT_PUBLIC_API_URL: string;
    NEXT_PUBLIC_ENABLE_ANALYTICS: string;
    // Add other variables
  }
}
```

## Validation Script

Create a script to validate environment variables:

```typescript
// scripts/validate-env.ts
const requiredVars = [
  'NEXT_PUBLIC_API_URL',
  'NEXT_PUBLIC_APP_URL',
];

const optionalVars = [
  'NEXT_PUBLIC_ENABLE_ANALYTICS',
  'NEXT_PUBLIC_VERCEL_ANALYTICS_ID',
  'NEXT_PUBLIC_SENTRY_DSN',
];

function validateEnv() {
  const missing: string[] = [];
  
  for (const varName of requiredVars) {
    if (!process.env[varName]) {
      missing.push(varName);
    }
  }
  
  if (missing.length > 0) {
    console.error('❌ Missing required environment variables:');
    missing.forEach(v => console.error(`  - ${v}`));
    process.exit(1);
  }
  
  console.log('✅ All required environment variables are set');
  
  const unset = optionalVars.filter(v => !process.env[v]);
  if (unset.length > 0) {
    console.warn('⚠️  Optional variables not set:');
    unset.forEach(v => console.warn(`  - ${v}`));
  }
}

validateEnv();
```

**Usage:**
```bash
# Add to package.json
{
  "scripts": {
    "validate-env": "ts-node scripts/validate-env.ts"
  }
}

# Run validation
npm run validate-env
```

## Quick Reference

### Required Variables

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NEXT_PUBLIC_API_URL` | `http://localhost:3001` | `https://api-staging.offerlens.com` | `https://api.offerlens.com` |
| `NEXT_PUBLIC_APP_URL` | `http://localhost:3000` | `https://offerlens-staging.vercel.app` | `https://offerlens.com` |

### Optional Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NEXT_PUBLIC_ENABLE_ANALYTICS` | `false` | Enable analytics |
| `NEXT_PUBLIC_VERCEL_ANALYTICS_ID` | Auto | Analytics ID |
| `NEXT_PUBLIC_ENABLE_FORUM` | `true` | Enable forum |
| `NEXT_PUBLIC_ENABLE_FEATURE_REQUESTS` | `true` | Enable feature requests |
| `NEXT_PUBLIC_SENTRY_DSN` | Empty | Error tracking |
| `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `development` | Sentry environment |
| `NEXT_PUBLIC_DEBUG` | `false` | Debug logging |
| `NEXT_PUBLIC_API_TIMEOUT` | `30000` | API timeout (ms) |

---

**Last Updated:** December 2024
**Version:** 1.0
**Owner:** DevOps Team
