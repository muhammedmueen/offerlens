# Local Development Setup Guide

Complete guide for setting up the OfferLens application for local development.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Backend Setup](#backend-setup)
- [Frontend Setup](#frontend-setup)
- [Running the Application](#running-the-application)
- [Troubleshooting](#troubleshooting)
- [Development Workflow](#development-workflow)

## Prerequisites

Before you begin, ensure you have the following installed on your system:

### Required Software

1. **Node.js 20+**
   - Download from [nodejs.org](https://nodejs.org/)
   - Verify installation: `node --version`
   - Should output: `v20.x.x` or higher

2. **npm 10+** (comes with Node.js)
   - Verify installation: `npm --version`
   - Should output: `10.x.x` or higher

3. **Docker Desktop** (Recommended for databases)
   - Download from [docker.com](https://www.docker.com/products/docker-desktop)
   - Verify installation: `docker --version` and `docker-compose --version`
   - Alternative: Install PostgreSQL and Redis manually (see below)

4. **Git**
   - Download from [git-scm.com](https://git-scm.com/)
   - Verify installation: `git --version`

### Optional but Recommended

- **VS Code** or your preferred code editor
- **Postman** or **Insomnia** for API testing
- **Redis Desktop Manager** or **RedisInsight** for Redis GUI
- **pgAdmin** or **DBeaver** for PostgreSQL GUI

## Backend Setup

### Step 1: Clone the Repository

```bash
git clone https://github.com/yourusername/offerlens.git
cd offerlens
```

### Step 2: Install Backend Dependencies

```bash
cd offerlens-backend
npm install
```

This will install all required dependencies including:
- Express.js (web framework)
- Prisma (database ORM)
- Redis client (ioredis)
- Winston (logging)
- Zod (validation)
- And many more...

### Step 3: Configure Environment Variables

Create a `.env` file in the `offerlens-backend` directory:

```bash
cp .env.example .env
```

Edit the `.env` file with your configuration:

```env
# Server Configuration
NODE_ENV=development
PORT=3001
HOST=localhost

# Database Configuration
DATABASE_URL=postgresql://offerlens:offerlens_dev_password@localhost:5432/offerlens_dev

# Redis Configuration
REDIS_URL=redis://localhost:6379

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# CORS Configuration
CORS_ORIGIN=http://localhost:5173

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# File Upload
MAX_FILE_SIZE_MB=10

# Logging
LOG_LEVEL=debug
```

**Important:** 
- Change `JWT_SECRET` to a strong random string
- The `CORS_ORIGIN` should match your frontend URL (default Vite port is 5173)

### Step 4: Start Database Services

#### Option A: Using Docker Compose (Recommended)

Start PostgreSQL and Redis with a single command:

```bash
npm run db:init
```

Or manually:

```bash
docker-compose up -d postgres redis
```

Verify services are running:

```bash
docker ps
```

You should see both `postgres` and `redis` containers running.

#### Option B: Manual Installation

**PostgreSQL:**

- **Windows:** Download from [postgresql.org](https://www.postgresql.org/download/windows/)
- **macOS:** `brew install postgresql@15 && brew services start postgresql@15`
- **Linux:** `sudo apt-get install postgresql-15`

Create database and user:

```sql
CREATE USER offerlens WITH PASSWORD 'offerlens_dev_password';
CREATE DATABASE offerlens_dev OWNER offerlens;
GRANT ALL PRIVILEGES ON DATABASE offerlens_dev TO offerlens;
```

**Redis:**

- **Windows:** Download from [github.com/microsoftarchive/redis](https://github.com/microsoftarchive/redis/releases)
- **macOS:** `brew install redis && brew services start redis`
- **Linux:** `sudo apt-get install redis-server && sudo systemctl start redis`

### Step 5: Set Up Database Schema

Generate Prisma client:

```bash
npm run prisma:generate
```

Run database migrations:

```bash
npm run prisma:migrate
```

This creates all necessary tables:
- `salary_benchmarks`
- `red_flag_rules`
- `feature_requests`
- `feature_request_votes`
- `analytics_events`
- `admin_users`

### Step 6: Seed Initial Data

Populate the database with sample data:

```bash
npm run prisma:seed
```

This will create:
- **660 salary benchmark records** (12 roles × 5 experience levels × 11 cities)
- **8 red flag detection rules**
- **1 default admin user** (username: `admin`, password: `admin123`)

### Step 7: Start Backend Development Server

```bash
npm run dev
```

The backend API will start at `http://localhost:3001`

Verify it's working:

```bash
curl http://localhost:3001/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2024-12-12T10:30:00.000Z",
  "uptime": 5.123
}
```

## Frontend Setup

### Step 1: Navigate to Frontend Directory

```bash
cd ../offerlens-frontend
```

### Step 2: Install Frontend Dependencies

```bash
npm install
```

This will install:
- React 18
- Vite (build tool)
- TailwindCSS (styling)
- Shadcn/ui (component library)
- React Router (routing)
- Axios (HTTP client)
- And more...

### Step 3: Configure Environment Variables

Create a `.env` file in the `offerlens-frontend` directory:

```bash
cp .env.example .env
```

Edit the `.env` file:

```env
# API Configuration
VITE_API_URL=http://localhost:3001/api/v1

# Feature Flags (optional)
VITE_ENABLE_FORUM=true
VITE_ENABLE_ANALYTICS=false
```

**Important:** The `VITE_API_URL` must match your backend URL.

### Step 4: Start Frontend Development Server

```bash
npm run dev
```

The frontend will start at `http://localhost:5173`

Open your browser and navigate to `http://localhost:5173`

## Running the Application

### Full Stack Development

To run both frontend and backend simultaneously:

**Terminal 1 (Backend):**
```bash
cd offerlens-backend
npm run dev
```

**Terminal 2 (Frontend):**
```bash
cd offerlens-frontend
npm run dev
```

**Terminal 3 (Optional - Database GUI):**
```bash
cd offerlens-backend
npm run prisma:studio
```

This opens Prisma Studio at `http://localhost:5555` for database browsing.

### Verify Everything is Working

1. **Backend Health Check:**
   ```bash
   curl http://localhost:3001/api/v1/health
   ```

2. **Frontend:** Open `http://localhost:5173` in your browser

3. **Test API Integration:**
   - Upload a sample offer letter
   - Check that analysis works
   - Submit a feature request

## Troubleshooting

### Common Issues and Solutions

#### 1. Port Already in Use

**Error:** `EADDRINUSE: address already in use :::3001`

**Solution:**
```bash
# Find process using the port
# Windows
netstat -ano | findstr :3001

# macOS/Linux
lsof -i :3001

# Kill the process
# Windows
taskkill /PID <PID> /F

# macOS/Linux
kill -9 <PID>
```

Or change the port in `.env`:
```env
PORT=3002
```

#### 2. Database Connection Failed

**Error:** `Can't reach database server at localhost:5432`

**Solution:**

Check if PostgreSQL is running:
```bash
# Docker
docker ps | grep postgres

# If not running
docker-compose up -d postgres

# Manual installation
# Windows
net start postgresql-x64-15

# macOS
brew services start postgresql@15

# Linux
sudo systemctl start postgresql
```

Verify connection:
```bash
# Using Docker
docker-compose exec postgres psql -U offerlens -d offerlens_dev

# Manual installation
psql -U offerlens -d offerlens_dev
```

#### 3. Redis Connection Failed

**Error:** `ECONNREFUSED 127.0.0.1:6379`

**Solution:**

Check if Redis is running:
```bash
# Docker
docker ps | grep redis

# If not running
docker-compose up -d redis

# Manual installation
# Windows
redis-server

# macOS
brew services start redis

# Linux
sudo systemctl start redis
```

Test Redis connection:
```bash
# Docker
docker-compose exec redis redis-cli ping

# Manual installation
redis-cli ping
```

Expected response: `PONG`

#### 4. Prisma Client Not Generated

**Error:** `Cannot find module '@prisma/client'`

**Solution:**
```bash
cd offerlens-backend
npm run prisma:generate
```

#### 5. Migration Failed

**Error:** `Migration failed to apply`

**Solution:**

Reset database (⚠️ deletes all data):
```bash
npm run db:reset
```

Or manually resolve:
```bash
npx prisma migrate resolve --applied "migration_name"
```

#### 6. CORS Errors in Browser

**Error:** `Access to XMLHttpRequest blocked by CORS policy`

**Solution:**

1. Check backend `.env`:
   ```env
   CORS_ORIGIN=http://localhost:5173
   ```

2. Check frontend `.env`:
   ```env
   VITE_API_URL=http://localhost:3001/api/v1
   ```

3. Restart both servers after changing environment variables

#### 7. Frontend Build Errors

**Error:** `Module not found` or `Cannot resolve module`

**Solution:**
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Vite cache
rm -rf node_modules/.vite
```

#### 8. Seed Script Fails

**Error:** `Unique constraint failed`

**Solution:**

The database already has data. Either:

1. Skip seeding (data already exists)
2. Reset database:
   ```bash
   npm run db:reset
   ```

#### 9. Docker Compose Issues

**Error:** `Cannot connect to Docker daemon`

**Solution:**

1. Ensure Docker Desktop is running
2. Check Docker status:
   ```bash
   docker info
   ```

3. Restart Docker Desktop

#### 10. Environment Variables Not Loading

**Error:** Variables are `undefined`

**Solution:**

1. Ensure `.env` file exists in the correct directory
2. Restart the development server
3. Check for typos in variable names
4. Frontend variables must start with `VITE_`

## Development Workflow

### Daily Development Routine

1. **Start Services:**
   ```bash
   # Terminal 1: Backend
   cd offerlens-backend && npm run dev
   
   # Terminal 2: Frontend
   cd offerlens-frontend && npm run dev
   ```

2. **Make Changes:**
   - Edit code in your editor
   - Both servers auto-reload on file changes

3. **Test Changes:**
   - Backend: Use Postman or curl
   - Frontend: Check browser at `http://localhost:5173`

4. **Run Tests:**
   ```bash
   # Backend tests
   cd offerlens-backend && npm test
   
   # Frontend tests (if available)
   cd offerlens-frontend && npm test
   ```

5. **Commit Changes:**
   ```bash
   git add .
   git commit -m "Description of changes"
   git push
   ```

### Database Management

**View Data:**
```bash
npm run prisma:studio
```

**Add New Migration:**
```bash
# After editing prisma/schema.prisma
npx prisma migrate dev --name description_of_changes
```

**Reset Database:**
```bash
npm run db:reset
```

**Backup Database:**
```bash
docker-compose exec postgres pg_dump -U offerlens offerlens_dev > backup.sql
```

**Restore Database:**
```bash
docker-compose exec -T postgres psql -U offerlens offerlens_dev < backup.sql
```

### Code Quality

**Lint Code:**
```bash
# Backend
cd offerlens-backend && npm run lint

# Frontend
cd offerlens-frontend && npm run lint
```

**Format Code:**
```bash
# Backend
cd offerlens-backend && npm run format

# Frontend
cd offerlens-frontend && npm run format
```

**Fix Issues Automatically:**
```bash
npm run lint:fix
npm run format
```

### Testing API Endpoints

**Using curl:**
```bash
# Health check
curl http://localhost:3001/api/v1/health

# Analyze offer (POST)
curl -X POST http://localhost:3001/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "offerText": "Your offer letter text here",
    "role": "Software Engineer",
    "experience": "3-5 years",
    "ctc": 25,
    "city": "Bangalore"
  }'

# Get metadata
curl http://localhost:3001/api/v1/roles
curl http://localhost:3001/api/v1/cities
curl http://localhost:3001/api/v1/experience-levels
```

**Using Postman:**

1. Import the API collection (if available)
2. Set base URL: `http://localhost:3001/api/v1`
3. Test each endpoint

### Debugging

**Backend Debugging:**

1. Add breakpoints in VS Code
2. Use debug configuration:
   ```json
   {
     "type": "node",
     "request": "launch",
     "name": "Debug Backend",
     "runtimeExecutable": "npm",
     "runtimeArgs": ["run", "dev"],
     "cwd": "${workspaceFolder}/offerlens-backend"
   }
   ```

**Frontend Debugging:**

1. Use browser DevTools (F12)
2. Check Console for errors
3. Use React DevTools extension
4. Check Network tab for API calls

**Database Debugging:**

1. Check logs:
   ```bash
   docker-compose logs postgres
   ```

2. Connect with psql:
   ```bash
   docker-compose exec postgres psql -U offerlens offerlens_dev
   ```

3. Run queries:
   ```sql
   SELECT * FROM salary_benchmarks LIMIT 10;
   SELECT * FROM red_flag_rules WHERE active = true;
   ```

### Performance Monitoring

**Check Backend Performance:**
```bash
# View logs
tail -f offerlens-backend/logs/combined.log

# Monitor Redis
docker-compose exec redis redis-cli monitor

# Monitor PostgreSQL
docker-compose exec postgres pg_top
```

**Check Frontend Performance:**
- Use Chrome DevTools Lighthouse
- Check Network tab for slow requests
- Use React Profiler

## Next Steps

Once your local environment is set up:

1. **Read the API Documentation:** See `API_DOCUMENTATION.md`
2. **Understand the Architecture:** See `ARCHITECTURE.md`
3. **Learn the Deployment Process:** See `DEPLOYMENT.md`
4. **Review Contributing Guidelines:** See `CONTRIBUTING.md`

## Getting Help

If you encounter issues not covered in this guide:

1. **Check existing documentation:**
   - `offerlens-backend/README.md`
   - `offerlens-backend/DATABASE.md`
   - `offerlens-backend/CACHE.md`

2. **Search GitHub Issues:**
   - [github.com/yourusername/offerlens/issues](https://github.com/yourusername/offerlens/issues)

3. **Ask for help:**
   - Create a new GitHub issue
   - Include error messages and logs
   - Describe steps to reproduce

## Summary Checklist

Before you start developing, ensure:

- [ ] Node.js 20+ installed
- [ ] Docker Desktop running (or PostgreSQL + Redis installed)
- [ ] Backend dependencies installed (`npm install`)
- [ ] Frontend dependencies installed (`npm install`)
- [ ] Backend `.env` configured
- [ ] Frontend `.env` configured
- [ ] Database services running
- [ ] Database migrated and seeded
- [ ] Backend server running at `http://localhost:3001`
- [ ] Frontend server running at `http://localhost:5173`
- [ ] Health check endpoint responding
- [ ] Frontend can communicate with backend

Happy coding! 🚀
