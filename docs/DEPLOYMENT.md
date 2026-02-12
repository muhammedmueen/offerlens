# Deployment Guide

This guide covers how to set up, run, and deploy the OfferLens Backend.

## Prerequisites

- **Node.js**: v20 or higher
- **Docker** & **Docker Compose**
- **PostgreSQL**: v16+
- **Redis**: v7+

---

## 1. Environment Setup

1. Copy the example environment file:
   \`\`\`bash
   cp .env.example .env
   \`\`\`

2. Configure the variables in \`.env\`:
   - \`PORT\`: API port (default: 8000)
   - \`DATABASE_URL\`: PostgreSQL connection string
   - \`REDIS_URL\`: Redis connection string
   - \`GOOGLE_CLOUD_CREDENTIALS\`: Path to GCP key JSON (for Vision API)
   - \`GEMINI_API_KEY\`: API key for Google Gemini
   - \`STORAGE_PATH\`: Local path for storing uploaded files

---

## 2. Local Development

### Using Docker for Dependencies
You can spin up Postgres and Redis using Docker Compose:

\`\`\`bash
docker-compose up -d
\`\`\`

### Running the Backend

1. **Install Dependencies**:
   \`\`\`bash
   npm install
   \`\`\`

2. **Run Migrations**:
   \`\`\`bash
   npm run db:migrate
   \`\`\`

3. **Seed Database** (Optional):
   \`\`\`bash
   npm run db:seed
   \`\`\`

4. **Start Development Server**:
   \`\`\`bash
   npm run dev
   \`\`\`

5. **Start Background Workers**:
   In a separate terminal:
   \`\`\`bash
   npm run workers
   \`\`\`

---

## 3. Production Deployment

### Option A: Docker (Recommended)

1. **Build the Image**:
   \`\`\`bash
   docker build -t offerlens-backend .
   \`\`\`

2. **Run the Container**:
   \`\`\`bash
   docker run -d \
     -p 8000:8000 \
     --env-file .env \
     -v $(pwd)/uploads:/app/uploads \
     --name offerlens-backend \
     offerlens-backend
   \`\`\`

   *Note: Ensure your `.env` file points to accessible DB/Redis hosts (e.g., use `host.docker.internal` or actual IP addresses if not in the same network).*

### Option B: PM2 (Traditional)

1. **Build the Project**:
   \`\`\`bash
   npm ci
   npm run build
   \`\`\`

2. **Start with PM2**:
   \`\`\`bash
   npm install -g pm2
   pm2 start dist/src/server.js --name offerlens-api
   pm2 start dist/src/workers/index.js --name offerlens-workers
   \`\`\`

3. **Save PM2 List**:
   \`\`\`bash
   pm2 save
   pm2 startup
   \`\`\`

---

## 4. Health Checks

- **API Health**: \`GET /health\` (if implemented) or check root \`/\`
- **Logs**: Check configured log files or stdout/stderr.

## 5. Troubleshooting

- **Database Connection**: Ensure \`DATABASE_URL\` is correct and the database is running.
- **Redis Connection**: Ensure \`REDIS_URL\` is reachable.
- **Permissions**: Ensure the \`uploads\` directory is writable by the process user.
