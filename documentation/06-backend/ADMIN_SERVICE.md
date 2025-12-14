# Admin Service Implementation

This document describes the Admin Service implementation for OfferLens backend.

## Overview

The Admin Service provides authentication and management capabilities for administrative operations including:
- Admin user authentication with JWT tokens
- Salary benchmark management (create, update, bulk import)
- Red flag rule management (create, update, activate/deactivate)
- Feature request status management

## Components

### 1. Admin Service (`src/services/admin.service.ts`)

Core service handling admin authentication and user management.

**Key Methods:**
- `authenticate(username, password)`: Authenticates admin and returns JWT token
- `verifyToken(token)`: Verifies JWT token and returns payload
- `createAdmin(username, password, role)`: Creates new admin user (for seeding)

### 2. Admin Controller (`src/controllers/admin.controller.ts`)

HTTP request handlers for admin endpoints.

**Endpoints:**
- `POST /api/v1/admin/login`: Admin login
- `POST /api/v1/admin/salary-benchmarks`: Create salary benchmark
- `PUT /api/v1/admin/salary-benchmarks/:id`: Update salary benchmark
- `POST /api/v1/admin/salary-benchmarks/import`: Bulk import salary benchmarks
- `POST /api/v1/admin/red-flag-rules`: Create red flag rule
- `PUT /api/v1/admin/red-flag-rules/:id`: Update red flag rule
- `PUT /api/v1/admin/feature-requests/:id/status`: Update feature request status

### 3. Auth Middleware (`src/middleware/auth.ts`)

JWT verification middleware for protecting admin routes.

**Middleware:**
- `authenticateAdmin`: Verifies JWT token and attaches admin info to request
- `requireSuperAdmin`: Ensures admin has super_admin role

### 4. Admin Routes (`src/routes/admin.routes.ts`)

Route definitions for admin endpoints.

## Authentication Flow

1. Admin sends POST request to `/api/v1/admin/login` with username and password
2. Service verifies credentials against database
3. If valid, generates JWT token with 7-day expiration
4. Token is returned to client
5. Client includes token in `Authorization: Bearer <token>` header for subsequent requests
6. Middleware verifies token and attaches admin info to request object

## Usage Examples

### Login

```bash
curl -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "admin123"
  }'
```

Response:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

### Create Salary Benchmark

```bash
curl -X POST http://localhost:3001/api/v1/admin/salary-benchmarks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "role": "Software Engineer",
    "experienceLevel": "3-5 years",
    "city": "Bangalore",
    "minSalary": 8,
    "avgSalary": 12,
    "maxSalary": 18
  }'
```

### Update Red Flag Rule

```bash
curl -X PUT http://localhost:3001/api/v1/admin/red-flag-rules/<id> \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "active": false
  }'
```

### Bulk Import Salary Benchmarks

```bash
curl -X POST http://localhost:3001/api/v1/admin/salary-benchmarks/import \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "data": [
      {
        "role": "Software Engineer",
        "experienceLevel": "0-1 years",
        "city": "Mumbai",
        "minSalary": 3.5,
        "avgSalary": 5.5,
        "maxSalary": 8
      },
      {
        "role": "Data Scientist",
        "experienceLevel": "1-3 years",
        "city": "Bangalore",
        "minSalary": 9,
        "avgSalary": 14,
        "maxSalary": 20
      }
    ]
  }'
```

### Update Feature Request Status

```bash
curl -X PUT http://localhost:3001/api/v1/admin/feature-requests/<id>/status \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "status": "in_progress",
    "adminNote": "Working on this feature for next release"
  }'
```

## Security Considerations

1. **Password Hashing**: Admin passwords are hashed using bcrypt with 10 salt rounds
2. **JWT Tokens**: Tokens expire after 7 days and are signed with a secret key
3. **Authorization**: All admin endpoints (except login) require valid JWT token
4. **Rate Limiting**: Admin endpoints should be protected by rate limiting middleware
5. **HTTPS**: In production, all admin endpoints must be accessed over HTTPS
6. **Secret Management**: JWT_SECRET must be stored securely (environment variable)

## Default Admin User

A default admin user is created during database seeding:
- Username: `admin`
- Password: `admin123` (or value from `ADMIN_PASSWORD` env var)
- Role: `super_admin`

**⚠️ Important**: Change the default password immediately in production!

## Cache Invalidation

When salary benchmarks or red flag rules are updated, the cache is automatically invalidated:
- Salary benchmarks: `salary_benchmarks:*` keys are deleted
- Red flag rules: `red_flag_rules` key is deleted

This ensures that the Analysis Engine always uses the latest data.

## Error Handling

All admin endpoints return structured error responses:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "timestamp": "2024-12-12T10:30:00.000Z",
    "requestId": "abc123"
  }
}
```

Common error codes:
- `VALIDATION_ERROR` (400): Invalid request data
- `UNAUTHORIZED` (401): Missing or invalid token
- `FORBIDDEN` (403): Insufficient permissions
- `INTERNAL_ERROR` (500): Server error

## Testing

Run admin service tests:
```bash
npm test -- admin.service.test.ts
```

## Requirements Validation

This implementation satisfies the following requirements:

- **Requirement 5.2**: Admin authentication with JWT tokens
- **Requirement 5.3**: Dynamic salary benchmark management with cache invalidation
- **Requirement 4.5**: Red flag rule management with activation/deactivation
- **Requirement 5.5**: Bulk import of salary data from JSON
- **Requirements 14.4, 14.5**: Feature request status management with admin notes

## Future Enhancements

1. Add admin user management endpoints (create, update, delete admins)
2. Implement role-based permissions (admin vs super_admin)
3. Add audit logging for all admin actions
4. Implement password reset functionality
5. Add two-factor authentication (2FA)
6. Create admin dashboard UI
7. Add CSV parsing for bulk imports
8. Implement data validation and duplicate detection for imports
