# OfferLens Backend API

Backend service for OfferLens - A job offer analysis application that helps candidates evaluate their offer letters.

## Features

- 🔒 Privacy-first architecture (no offer data persistence)
- 🚀 RESTful API with Express.js
- 📊 PostgreSQL database for system data
- ⚡ Redis caching for performance
- 🔐 JWT authentication for admin operations
- 📝 Request validation with Zod
- 🐳 Docker support for local development
- 📈 Comprehensive logging with Winston

## Prerequisites

- Node.js 20+
- PostgreSQL 15+
- Redis 7+
- Docker & Docker Compose (optional)

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

### 2. Environment Configuration

Copy the example environment file and configure it:

```bash
cp .env.example .env
```

Edit `.env` with your configuration values.

### 3. Database Setup

#### Option A: Using Docker Compose (Recommended)

Start PostgreSQL and Redis:

```bash
npm run db:init
```

Or manually:

```bash
docker-compose up -d postgres redis
```

#### Option B: Local Installation

Install and start PostgreSQL and Redis locally, then update the connection strings in `.env`.

### 4. Run Database Migrations

```bash
npm run prisma:migrate
```

### 5. Seed Initial Data

```bash
npm run prisma:seed
```

This will populate the database with:
- Salary benchmarks for 12 roles across 11 cities
- 8 red flag detection rules
- Default admin user (username: `admin`, password: `admin123`)

📖 **For detailed database documentation, see [DATABASE.md](./DATABASE.md)**
📖 **For Redis cache documentation, see [CACHE.md](./CACHE.md)**

### 6. Start Development Server

```bash
npm run dev
```

The API will be available at `http://localhost:3001`.

## Available Scripts

### Development
- `npm run dev` - Start development server with hot reload
- `npm run build` - Build for production
- `npm start` - Start production server

### Database
- `npm run db:init` - Initialize PostgreSQL and Redis with Docker
- `npm run prisma:generate` - Generate Prisma client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:migrate:deploy` - Deploy migrations (production)
- `npm run prisma:seed` - Seed database with initial data
- `npm run prisma:studio` - Open Prisma Studio (database GUI)
- `npm run db:reset` - Reset database (⚠️ deletes all data)

### Code Quality
- `npm run lint` - Run ESLint
- `npm run lint:fix` - Fix ESLint errors
- `npm run format` - Format code with Prettier
- `npm run format:check` - Check code formatting

### Testing
- `npm test` - Run tests
- `npm run test:watch` - Run tests in watch mode
- `npm run test:coverage` - Generate test coverage report

## Project Structure

```
src/
├── config/          # Configuration and environment variables
├── controllers/     # HTTP request handlers
├── services/        # Business logic services
├── models/          # Data models and types
├── middleware/      # Express middleware
├── routes/          # API route definitions
├── utils/           # Utility functions
├── app.ts           # Express app setup
└── index.ts         # Application entry point
```

## API Endpoints

### Health Check
- `GET /api/v1/health` - Health check endpoint

### Analysis (Coming Soon)
- `POST /api/v1/analyze` - Analyze job offer

### Feature Requests (Coming Soon)
- `POST /api/v1/feature-requests` - Submit feature request
- `GET /api/v1/feature-requests` - List feature requests

### Admin (Coming Soon)
- `POST /api/v1/admin/login` - Admin login
- `POST /api/v1/admin/salary-benchmarks` - Manage salary data
- `POST /api/v1/admin/red-flag-rules` - Manage red flag rules

## Docker Deployment

### Build Image

```bash
docker build -t offerlens-backend .
```

### Run with Docker Compose

```bash
docker-compose up
```

This will start:
- PostgreSQL database
- Redis cache
- Backend API server

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Environment Variables

See `.env.example` for all available configuration options.

Key variables:
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret key for JWT tokens
- `CORS_ORIGIN` - Allowed CORS origin (frontend URL)

## Deployment

### Quick Deploy to Railway (Recommended)

1. **Fork/Clone this repository**
2. **Sign up at [Railway](https://railway.app)**
3. **Create new project from GitHub repo**
4. **Add PostgreSQL plugin** (provides `DATABASE_URL` automatically)
5. **Add Redis plugin** (provides `REDIS_URL` automatically)
6. **Set environment variables**:
   ```bash
   JWT_SECRET=<generate-with-openssl-rand-base64-32>
   CORS_ORIGIN=https://your-frontend-domain.vercel.app
   ADMIN_EMAIL=admin@yourdomain.com
   EMAIL_API_KEY=your-email-api-key
   ```
7. **Deploy!** Railway auto-deploys on push to main

📖 **For detailed deployment instructions, see [DEPLOYMENT.md](./DEPLOYMENT.md)**
📖 **For CI/CD pipeline documentation, see [CI_CD.md](./CI_CD.md)**

### Alternative Platforms

- **AWS**: EC2 + RDS + ElastiCache
- **DigitalOcean**: Droplets + Managed Databases
- **Render**: Similar to Railway
- **Heroku**: Add PostgreSQL and Redis add-ons

See [DEPLOYMENT.md](./DEPLOYMENT.md) for platform-specific guides.

## Production Checklist

Before deploying to production:

- [ ] Generate strong `JWT_SECRET` (32+ characters)
- [ ] Set `NODE_ENV=production`
- [ ] Configure proper `CORS_ORIGIN`
- [ ] Set up database backups
- [ ] Configure error monitoring (Sentry)
- [ ] Enable health checks
- [ ] Set up uptime monitoring
- [ ] Review rate limiting settings
- [ ] Test all critical endpoints
- [ ] Set up SSL/HTTPS (automatic on Railway/Vercel)

## Documentation

- [DEPLOYMENT.md](./DEPLOYMENT.md) - Comprehensive deployment guide
- [CI_CD.md](./CI_CD.md) - CI/CD pipeline documentation
- [DATABASE.md](./DATABASE.md) - Database schema and management
- [CACHE.md](./CACHE.md) - Redis caching strategy
- [ERROR_HANDLING.md](./ERROR_HANDLING.md) - Error handling patterns
- [RETRY_AND_CIRCUIT_BREAKER.md](./RETRY_AND_CIRCUIT_BREAKER.md) - Resilience patterns

## Support

- **Issues**: [GitHub Issues](https://github.com/yourusername/offerlens/issues)
- **Discussions**: [GitHub Discussions](https://github.com/yourusername/offerlens/discussions)
- **Email**: support@offerlens.com

## License

MIT
