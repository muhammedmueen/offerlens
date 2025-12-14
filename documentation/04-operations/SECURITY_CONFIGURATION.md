# Security and Configuration Guide

Comprehensive security best practices and configuration guide for OfferLens.

## Table of Contents

- [SSL/TLS Configuration](#ssltls-configuration)
- [Environment Variables Security](#environment-variables-security)
- [Secrets Management](#secrets-management)
- [CORS Configuration](#cors-configuration)
- [Rate Limiting](#rate-limiting)
- [Admin User Management](#admin-user-management)
- [Security Headers](#security-headers)
- [Input Validation](#input-validation)
- [Authentication Security](#authentication-security)
- [Database Security](#database-security)

## SSL/TLS Configuration

### Automatic HTTPS (Railway & Vercel)

Both Railway and Vercel provide automatic HTTPS:

**Railway:**
- Automatic SSL certificate provisioning
- Let's Encrypt certificates
- Auto-renewal
- No configuration needed

**Vercel:**
- Automatic SSL for all deployments
- Let's Encrypt certificates
- Auto-renewal
- Custom domain SSL included

### Custom Domain SSL

**Railway:**
1. Add custom domain in Settings → Domains
2. Add CNAME record to your DNS
3. Railway automatically provisions SSL
4. Certificate renews automatically

**Vercel:**
1. Add custom domain in Settings → Domains
2. Add DNS records (A or CNAME)
3. Vercel automatically provisions SSL
4. Certificate renews automatically

### Force HTTPS

**Backend (Express):**
```typescript
// src/middleware/forceHttps.ts
export const forceHttps = (req, res, next) => {
  if (process.env.NODE_ENV === 'production' && !req.secure) {
    return res.redirect(301, `https://${req.headers.host}${req.url}`);
  }
  next();
};

// src/app.ts
app.use(forceHttps);
```

### SSL Best Practices

- ✅ Use TLS 1.2 or higher
- ✅ Enable HSTS (HTTP Strict Transport Security)
- ✅ Use strong cipher suites
- ✅ Disable SSLv3 and TLS 1.0/1.1
- ✅ Monitor certificate expiration
- ✅ Use certificate pinning (advanced)

## Environment Variables Security

### Best Practices

**Never commit secrets:**
```bash
# .gitignore
.env
.env.local
.env.*.local
.env.production
```

**Use strong secrets:**
```bash
# Generate strong JWT secret
openssl rand -base64 32

# Generate strong password
openssl rand -base64 24
```

**Separate by environment:**
```
.env.development    # Local development
.env.staging        # Staging environment
.env.production     # Production environment
```

### Railway Environment Variables

**Setting variables:**
1. Go to Railway dashboard
2. Click on service
3. Go to "Variables" tab
4. Click "+ New Variable"
5. Add key and value

**Variable precedence:**
1. Service variables (highest)
2. Shared variables
3. Plugin variables (DATABASE_URL, REDIS_URL)

**Best practices:**
- ✅ Use Railway dashboard for secrets
- ✅ Never log environment variables
- ✅ Use different secrets per environment
- ✅ Rotate secrets regularly
- ❌ Don't expose secrets in error messages
- ❌ Don't commit .env files

### Vercel Environment Variables

**Setting variables:**
1. Go to Vercel dashboard
2. Go to Settings → Environment Variables
3. Add variable name and value
4. Select environments (Production, Preview, Development)

**Frontend variables:**
```env
# Must start with VITE_ to be exposed to client
VITE_API_URL=https://api.offerlens.com/api/v1

# Not exposed to client (server-side only)
API_SECRET=secret-key
```

**Best practices:**
- ✅ Prefix client variables with `VITE_`
- ✅ Never expose sensitive keys to client
- ✅ Use different values per environment
- ❌ Don't put secrets in VITE_ variables
- ❌ Don't commit .env files

## Secrets Management

### Railway Secrets

**Built-in secrets management:**
- Encrypted at rest
- Encrypted in transit
- Access controlled by project permissions
- Audit logging (Pro plan)

**Accessing secrets:**
```bash
# Via Railway CLI
railway variables get JWT_SECRET

# In application
const jwtSecret = process.env.JWT_SECRET;
```

### AWS Secrets Manager (Advanced)

**For sensitive production secrets:**

**1. Store secret in AWS:**
```bash
aws secretsmanager create-secret \
  --name offerlens/production/jwt-secret \
  --secret-string "your-secret-value"
```

**2. Retrieve in application:**
```typescript
import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';

const client = new SecretsManagerClient({ region: 'us-east-1' });

async function getSecret(secretName: string) {
  const command = new GetSecretValueCommand({ SecretId: secretName });
  const response = await client.send(command);
  return response.SecretString;
}

// Usage
const jwtSecret = await getSecret('offerlens/production/jwt-secret');
```

**3. Set AWS credentials in Railway:**
```env
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
```

### HashiCorp Vault (Advanced)

**For enterprise secrets management:**

**1. Set up Vault:**
```bash
# Install Vault
brew install vault

# Start Vault server
vault server -dev
```

**2. Store secrets:**
```bash
vault kv put secret/offerlens/production \
  jwt_secret="your-secret" \
  database_password="your-password"
```

**3. Retrieve in application:**
```typescript
import vault from 'node-vault';

const vaultClient = vault({
  endpoint: process.env.VAULT_ADDR,
  token: process.env.VAULT_TOKEN,
});

async function getSecret(path: string) {
  const result = await vaultClient.read(path);
  return result.data;
}

// Usage
const secrets = await getSecret('secret/offerlens/production');
const jwtSecret = secrets.jwt_secret;
```

### Secret Rotation

**Rotate secrets regularly:**

**JWT Secret rotation:**
1. Generate new secret
2. Add as `JWT_SECRET_NEW` in Railway
3. Update code to accept both secrets
4. Deploy
5. After 7 days, remove old secret
6. Rename `JWT_SECRET_NEW` to `JWT_SECRET`

**Database password rotation:**
1. Create new database user
2. Update `DATABASE_URL` with new credentials
3. Deploy
4. Verify connection
5. Delete old database user

**Rotation schedule:**
- JWT secrets: Every 90 days
- Database passwords: Every 180 days
- API keys: Every 90 days
- Admin passwords: Every 60 days

## CORS Configuration

### Backend CORS Setup

**Basic configuration:**
```typescript
// src/app.ts
import cors from 'cors';

const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || [],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
  maxAge: 86400, // 24 hours
};

app.use(cors(corsOptions));
```

**Environment variables:**
```env
# Development
CORS_ORIGIN=http://localhost:5173

# Staging
CORS_ORIGIN=https://offerlens-staging.vercel.app

# Production (multiple origins)
CORS_ORIGIN=https://offerlens.com,https://www.offerlens.com,https://app.offerlens.com
```

### Dynamic CORS (Advanced)

**Allow specific patterns:**
```typescript
const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (mobile apps, Postman)
    if (!origin) return callback(null, true);
    
    // Allow specific origins
    const allowedOrigins = process.env.CORS_ORIGIN?.split(',') || [];
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    
    // Allow preview deployments (Vercel)
    if (origin.endsWith('.vercel.app')) {
      return callback(null, true);
    }
    
    // Reject others
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};
```

### CORS Best Practices

- ✅ Whitelist specific origins
- ✅ Use environment variables
- ✅ Enable credentials for cookies/auth
- ✅ Limit allowed methods
- ✅ Set appropriate max age
- ❌ Don't use `origin: '*'` in production
- ❌ Don't allow all methods
- ❌ Don't expose sensitive headers

## Rate Limiting

### Implementation

**Basic rate limiting:**
```typescript
// src/middleware/rateLimiter.ts
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import { redis } from '../lib/redis';

export const createRateLimiter = (options: {
  windowMs: number;
  max: number;
  message?: string;
}) => {
  return rateLimit({
    store: new RedisStore({
      client: redis,
      prefix: 'rate-limit:',
    }),
    windowMs: options.windowMs,
    max: options.max,
    message: options.message || 'Too many requests',
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      res.status(429).json({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: options.message || 'Too many requests. Please try again later.',
        },
      });
    },
  });
};

// Usage
export const apiLimiter = createRateLimiter({
  windowMs: 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
});

export const analysisLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: 10, // 10 analyses per minute
  message: 'Too many analysis requests. Please try again in a minute.',
});
```

**Apply to routes:**
```typescript
// src/routes/analysis.routes.ts
import { analysisLimiter } from '../middleware/rateLimiter';

router.post('/analyze', analysisLimiter, analyzeController);
```

### Rate Limit Configuration

**Recommended limits:**

| Endpoint | Limit | Window |
|----------|-------|--------|
| `/api/v1/analyze` | 10 | 1 minute |
| `/api/v1/extract-text` | 5 | 1 minute |
| `/api/v1/feature-requests` | 5 | 1 minute |
| `/api/v1/admin/*` | 20 | 1 minute |
| All other endpoints | 100 | 1 minute |

**Environment variables:**
```env
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
RATE_LIMIT_ANALYSIS_MAX=10
```

### Rate Limit Best Practices

- ✅ Use Redis for distributed rate limiting
- ✅ Return 429 status code
- ✅ Include Retry-After header
- ✅ Log rate limit violations
- ✅ Different limits for different endpoints
- ✅ Higher limits for authenticated users
- ❌ Don't block legitimate users
- ❌ Don't use in-memory store in production

## Admin User Management

### Creating Admin Users

**Initial admin user (seed):**
```typescript
// prisma/seed.ts
import bcrypt from 'bcrypt';

const adminPassword = await bcrypt.hash('admin123', 10);

await prisma.adminUser.create({
  data: {
    username: 'admin',
    passwordHash: adminPassword,
    role: 'admin',
  },
});
```

**Create admin via CLI:**
```bash
# Using Railway CLI
railway run npm run create-admin

# Or manually
railway run npx prisma studio
# Then add user in admin_users table
```

**Create admin script:**
```typescript
// scripts/create-admin.ts
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import readline from 'readline';

const prisma = new PrismaClient();
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

async function createAdmin() {
  const username = await question('Username: ');
  const password = await question('Password: ');
  const role = await question('Role (admin/super_admin): ');
  
  const passwordHash = await bcrypt.hash(password, 10);
  
  await prisma.adminUser.create({
    data: {
      username,
      passwordHash,
      role: role || 'admin',
    },
  });
  
  console.log('Admin user created successfully');
}

createAdmin()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
```

### Password Requirements

**Enforce strong passwords:**
```typescript
// src/utils/validation.ts
export function validatePassword(password: string): boolean {
  // Minimum 8 characters
  if (password.length < 8) return false;
  
  // At least one uppercase letter
  if (!/[A-Z]/.test(password)) return false;
  
  // At least one lowercase letter
  if (!/[a-z]/.test(password)) return false;
  
  // At least one number
  if (!/[0-9]/.test(password)) return false;
  
  // At least one special character
  if (!/[!@#$%^&*]/.test(password)) return false;
  
  return true;
}
```

### Password Hashing

**Use bcrypt:**
```typescript
import bcrypt from 'bcrypt';

// Hash password
const saltRounds = 10;
const passwordHash = await bcrypt.hash(password, saltRounds);

// Verify password
const isValid = await bcrypt.compare(password, passwordHash);
```

**Best practices:**
- ✅ Use bcrypt with 10+ salt rounds
- ✅ Never store plain text passwords
- ✅ Hash passwords before storing
- ✅ Use timing-safe comparison
- ❌ Don't use MD5 or SHA1
- ❌ Don't log passwords
- ❌ Don't send passwords in responses

### Admin Access Control

**Role-based access:**
```typescript
// src/middleware/auth.ts
export const requireAdmin = async (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
    });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET!);
    const admin = await prisma.adminUser.findUnique({
      where: { id: decoded.userId },
    });
    
    if (!admin) {
      return res.status(401).json({
        error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
      });
    }
    
    req.user = admin;
    next();
  } catch (error) {
    return res.status(401).json({
      error: { code: 'UNAUTHORIZED', message: 'Invalid token' },
    });
  }
};

export const requireSuperAdmin = async (req, res, next) => {
  await requireAdmin(req, res, () => {
    if (req.user.role !== 'super_admin') {
      return res.status(403).json({
        error: { code: 'FORBIDDEN', message: 'Insufficient permissions' },
      });
    }
    next();
  });
};
```

## Security Headers

### Helmet Configuration

**Install Helmet:**
```bash
npm install helmet
```

**Configure:**
```typescript
// src/app.ts
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
    },
  },
  hsts: {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true,
  },
  frameguard: {
    action: 'deny',
  },
  noSniff: true,
  xssFilter: true,
}));
```

### Custom Security Headers

**Add additional headers:**
```typescript
app.use((req, res, next) => {
  // Prevent clickjacking
  res.setHeader('X-Frame-Options', 'DENY');
  
  // Prevent MIME sniffing
  res.setHeader('X-Content-Type-Options', 'nosniff');
  
  // Enable XSS protection
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Referrer policy
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  
  // Permissions policy
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  
  next();
});
```

## Input Validation

### Zod Validation

**Define schemas:**
```typescript
// src/schemas/analysis.schema.ts
import { z } from 'zod';

export const analysisSchema = z.object({
  offerText: z.string().min(100).max(50000),
  role: z.string().min(1).max(100),
  experience: z.string().min(1).max(50),
  ctc: z.number().positive().max(1000),
  city: z.string().min(1).max(100),
});
```

**Validate requests:**
```typescript
// src/middleware/validation.ts
import { z } from 'zod';

export const validate = (schema: z.ZodSchema) => {
  return (req, res, next) => {
    try {
      schema.parse(req.body);
      next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request data',
            details: error.errors,
          },
        });
      }
      next(error);
    }
  };
};

// Usage
router.post('/analyze', validate(analysisSchema), analyzeController);
```

### Sanitization

**Sanitize user inputs:**
```typescript
// src/utils/sanitization.ts
import DOMPurify from 'isomorphic-dompurify';

export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
  });
}

export function sanitizeString(str: string): string {
  return str
    .trim()
    .replace(/[<>]/g, '') // Remove < and >
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, ''); // Remove event handlers
}
```

## Authentication Security

### JWT Best Practices

**Generate secure tokens:**
```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    userId: admin.id,
    role: admin.role,
  },
  process.env.JWT_SECRET!,
  {
    expiresIn: '7d',
    issuer: 'offerlens',
    audience: 'offerlens-api',
  }
);
```

**Verify tokens:**
```typescript
try {
  const decoded = jwt.verify(token, process.env.JWT_SECRET!, {
    issuer: 'offerlens',
    audience: 'offerlens-api',
  });
} catch (error) {
  // Invalid token
}
```

**Best practices:**
- ✅ Use strong secret (32+ characters)
- ✅ Set expiration time
- ✅ Include issuer and audience
- ✅ Rotate secrets regularly
- ✅ Use HTTPS only
- ❌ Don't store sensitive data in JWT
- ❌ Don't use weak algorithms (HS256 is fine)
- ❌ Don't expose JWT secret

## Database Security

### Connection Security

**Use SSL in production:**
```env
DATABASE_URL="postgresql://user:pass@host:5432/db?sslmode=require"
```

**Restrict access by IP:**
- Railway: Automatic (internal network)
- AWS RDS: Security groups
- DigitalOcean: Trusted sources

### SQL Injection Prevention

**Use Prisma (safe by default):**
```typescript
// Safe - parameterized query
const user = await prisma.user.findUnique({
  where: { email: userEmail },
});

// Unsafe - raw SQL (avoid)
const users = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${userEmail}`;
```

**If using raw SQL:**
```typescript
// Use parameterized queries
const users = await prisma.$queryRaw`
  SELECT * FROM users WHERE email = ${userEmail}
`;

// Never concatenate strings
// ❌ DON'T DO THIS
const query = `SELECT * FROM users WHERE email = '${userEmail}'`;
```

### Database Credentials

**Best practices:**
- ✅ Use strong passwords (20+ characters)
- ✅ Rotate credentials regularly
- ✅ Use different credentials per environment
- ✅ Restrict database user permissions
- ✅ Enable audit logging
- ❌ Don't use default passwords
- ❌ Don't share credentials
- ❌ Don't commit credentials to git

## Security Checklist

### Development
- [ ] Never commit .env files
- [ ] Use strong local passwords
- [ ] Keep dependencies updated
- [ ] Run security audits (`npm audit`)
- [ ] Use HTTPS for local API calls
- [ ] Sanitize all user inputs
- [ ] Validate all requests

### Staging
- [ ] Use production-like security
- [ ] Different secrets from production
- [ ] Enable HTTPS
- [ ] Configure CORS properly
- [ ] Enable rate limiting
- [ ] Test security measures
- [ ] Review logs regularly

### Production
- [ ] Strong JWT secret (32+ characters)
- [ ] HTTPS enabled (automatic)
- [ ] CORS whitelist configured
- [ ] Rate limiting active
- [ ] Security headers configured
- [ ] Input validation enabled
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] Admin access restricted
- [ ] Secrets in secure storage
- [ ] Database SSL enabled
- [ ] Regular security audits
- [ ] Monitoring and alerting
- [ ] Incident response plan

## Security Monitoring

### Log Security Events

```typescript
// src/utils/logger.ts
export function logSecurityEvent(event: {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: any;
}) {
  logger.warn('Security event', {
    type: event.type,
    severity: event.severity,
    details: event.details,
    timestamp: new Date().toISOString(),
  });
  
  // Send to security monitoring service
  if (event.severity === 'critical') {
    // Alert security team
  }
}

// Usage
logSecurityEvent({
  type: 'RATE_LIMIT_EXCEEDED',
  severity: 'medium',
  details: { ip: req.ip, endpoint: req.path },
});
```

### Security Audit Schedule

- **Daily**: Review error logs
- **Weekly**: Check for failed login attempts
- **Monthly**: Run `npm audit` and update dependencies
- **Quarterly**: Full security audit
- **Annually**: Penetration testing

## Resources

- **OWASP Top 10**: [owasp.org/www-project-top-ten](https://owasp.org/www-project-top-ten/)
- **Node.js Security**: [nodejs.org/en/docs/guides/security](https://nodejs.org/en/docs/guides/security/)
- **Express Security**: [expressjs.com/en/advanced/best-practice-security.html](https://expressjs.com/en/advanced/best-practice-security.html)
- **Railway Security**: [docs.railway.app/reference/security](https://docs.railway.app/reference/security)

---

**Last Updated**: December 12, 2024  
**Maintained By**: OfferLens Team
