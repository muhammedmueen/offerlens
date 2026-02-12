# Stage 1: Builder
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies needed for build (including devDependencies)
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Remove dev dependencies for production
RUN npm prune --production

# Stage 2: Runner
FROM node:20-alpine AS runner

WORKDIR /app

# Install production dependencies (like curl for healthcheck if needed)
# RUN apk add --no-cache curl

# Copy built artifacts and production node_modules from builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json

# Copy other necessary files
# COPY .env.example .env.example # Optional, usually env vars come from container env

# Create uploads directory if it doesn't exist (and ensure permissions)
RUN mkdir -p uploads && chown -R node:node uploads

# Switch to non-root user
USER node

# Expose the port
EXPOSE 8000

# Start the application
CMD ["npm", "start"]
