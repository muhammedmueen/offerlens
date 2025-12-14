# Metadata Endpoints Implementation

## Overview

This document describes the implementation of metadata endpoints that provide access to system metadata like roles, experience levels, and cities. These endpoints are used by the frontend to populate dropdowns and form fields.

## Implemented Endpoints

### 1. GET /api/v1/roles

Returns all unique roles available in the salary benchmarks database.

**Response:**
```json
{
  "success": true,
  "data": [
    "Backend Developer",
    "Business Analyst",
    "Data Analyst",
    "Data Scientist",
    "DevOps Engineer",
    "Frontend Developer",
    "HR Manager",
    "Marketing Executive",
    "Product Manager",
    "QA Engineer",
    "Software Engineer",
    "UI/UX Designer"
  ],
  "count": 12
}
```

### 2. GET /api/v1/experience-levels

Returns all unique experience levels available in the salary benchmarks database.

**Response:**
```json
{
  "success": true,
  "data": [
    "0-1 years",
    "1-3 years",
    "3-5 years",
    "5-8 years",
    "8+ years"
  ],
  "count": 5
}
```

### 3. GET /api/v1/cities

Returns all unique cities available in the salary benchmarks database.

**Response:**
```json
{
  "success": true,
  "data": [
    "Ahmedabad",
    "Bangalore",
    "Chennai",
    "Delhi NCR",
    "Hyderabad",
    "Kolkata",
    "Mumbai",
    "Other Tier 1",
    "Pune",
    "Remote",
    "Tier 2 City"
  ],
  "count": 11
}
```

## Caching Strategy

All metadata endpoints implement Redis caching with the following characteristics:

- **Cache TTL**: 1 hour (3600 seconds)
- **Cache Keys**:
  - `metadata:roles` - Stores the list of roles
  - `metadata:experience-levels` - Stores the list of experience levels
  - `metadata:cities` - Stores the list of cities

### Cache Invalidation

The metadata cache is automatically invalidated when salary benchmarks are updated through the admin endpoints:

- `POST /api/v1/admin/salary-benchmarks` - Create new salary benchmark
- `PUT /api/v1/admin/salary-benchmarks/:id` - Update existing salary benchmark
- `POST /api/v1/admin/salary-benchmarks/import` - Bulk import salary benchmarks

When any of these operations occur, the `metadataService.invalidateCache()` method is called to clear all metadata caches, ensuring that the next request will fetch fresh data from the database.

## Implementation Details

### Files Created

1. **src/services/metadata.service.ts**
   - `MetadataService` class with methods to fetch and cache metadata
   - `getRoles()` - Fetches unique roles from database
   - `getExperienceLevels()` - Fetches unique experience levels from database
   - `getCities()` - Fetches unique cities from database
   - `invalidateCache()` - Clears all metadata caches

2. **src/controllers/metadata.controller.ts**
   - `getRoles` - Controller for GET /api/v1/roles
   - `getExperienceLevels` - Controller for GET /api/v1/experience-levels
   - `getCities` - Controller for GET /api/v1/cities

3. **src/routes/metadata.routes.ts**
   - Route definitions for metadata endpoints

4. **src/controllers/__tests__/metadata.controller.test.ts**
   - Comprehensive test suite for metadata endpoints
   - Tests for caching behavior
   - Tests for cache invalidation

### Files Modified

1. **src/routes/index.ts**
   - Added metadata routes to the main router

2. **src/controllers/admin.controller.ts**
   - Added `metadataService.invalidateCache()` calls to:
     - `createSalaryBenchmark()`
     - `updateSalaryBenchmark()`
     - `importSalaryBenchmarks()`

## Testing

### Running Tests

To run the metadata endpoint tests:

```bash
npm test -- metadata.controller.test.ts
```

**Note**: Tests require Redis to be running. Start Redis using:

```bash
docker compose up -d redis
```

### Manual Testing

You can test the endpoints manually using curl or any HTTP client:

```bash
# Get all roles
curl http://localhost:3001/api/v1/roles

# Get all experience levels
curl http://localhost:3001/api/v1/experience-levels

# Get all cities
curl http://localhost:3001/api/v1/cities
```

## Performance Considerations

1. **Database Queries**: The service uses `distinct` queries with ordering, which are optimized with database indexes on the `salary_benchmarks` table.

2. **Caching**: Redis caching reduces database load significantly. After the first request, subsequent requests are served from cache for 1 hour.

3. **Graceful Degradation**: If Redis is unavailable, the service falls back to querying the database directly without throwing errors.

## Requirements Satisfied

This implementation satisfies **Requirement 5.1** from the requirements document:

> THE Data Store SHALL maintain salary benchmark data organized by role, experience level, and location

The metadata endpoints provide access to the distinct values of these organizational dimensions, enabling the frontend to present users with valid options when analyzing their offers.

## Future Enhancements

1. **Pagination**: If the number of roles/cities grows significantly, consider adding pagination support.

2. **Filtering**: Add query parameters to filter metadata (e.g., only active roles, only tier 1 cities).

3. **Metadata Statistics**: Include additional information like the number of salary benchmarks per role/city.

4. **Localization**: Support for multiple languages in role names and city names.

5. **Admin Metadata Management**: Allow admins to add/remove/rename roles and cities independently of salary benchmarks.
