# Build from backend/:  docker build -t offerlens-backend .
# Same image runs both processes. API (default CMD):  node dist/src/server.js
# Workers (override the command):                     node dist/src/workers/index.js
# The workers must mount the same STORAGE_PATH volume as the API. Migrations, seed and the
# data loaders are NOT in this image: run them from a repo checkout (see docs/DEPLOYMENT.md).

# Stage 1: Builder
FROM node:22-alpine AS builder
WORKDIR /app

# Install dependencies needed for build (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application (tsc, then tsc-alias rewrites the @/ path aliases)
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --omit=dev

# Stage 2: Runner
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Copy built artifacts and production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Uploads directory (STORAGE_PATH default ./uploads); mount a shared volume over it
RUN mkdir -p uploads && chown -R node:node uploads

# Switch to non-root user
USER node

# Expose the port
EXPOSE 8000

# Start the API
CMD ["node", "dist/src/server.js"]
