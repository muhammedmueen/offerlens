#!/bin/bash

# Database initialization script for local development
# This script ensures the PostgreSQL database is ready for use

set -e

echo "🔧 Initializing PostgreSQL database..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
  echo "❌ Docker is not running. Please start Docker first."
  exit 1
fi

# Start PostgreSQL and Redis containers
echo "📦 Starting PostgreSQL and Redis containers..."
docker-compose up -d postgres redis

# Wait for PostgreSQL to be ready
echo "⏳ Waiting for PostgreSQL to be ready..."
until docker-compose exec -T postgres pg_isready -U offerlens > /dev/null 2>&1; do
  echo "   Waiting for PostgreSQL..."
  sleep 2
done

echo "✅ PostgreSQL is ready!"

# Check if database exists, create if not
echo "🗄️  Checking database..."
DB_EXISTS=$(docker-compose exec -T postgres psql -U offerlens -lqt | cut -d \| -f 1 | grep -w offerlens_dev | wc -l)

if [ "$DB_EXISTS" -eq 0 ]; then
  echo "📝 Creating database offerlens_dev..."
  docker-compose exec -T postgres psql -U offerlens -c "CREATE DATABASE offerlens_dev;"
  echo "✅ Database created!"
else
  echo "✅ Database already exists!"
fi

echo ""
echo "🎉 Database initialization complete!"
echo ""
echo "Next steps:"
echo "  1. Run 'npm run prisma:migrate' to apply migrations"
echo "  2. Run 'npm run prisma:seed' to seed initial data"
echo ""
