# OfferLens API Documentation

Complete API reference for the OfferLens backend service.

## Table of Contents

- [Overview](#overview)
- [Base URL](#base-url)
- [Authentication](#authentication)
- [Rate Limiting](#rate-limiting)
- [Error Handling](#error-handling)
- [Endpoints](#endpoints)
  - [Health Check](#health-check)
  - [Analysis](#analysis)
  - [OCR/Text Extraction](#ocrtext-extraction)
  - [Feature Requests](#feature-requests)
  - [Metadata](#metadata)
  - [Admin](#admin)

## Overview

The OfferLens API is a RESTful API that provides job offer analysis, text extraction, and feature request management capabilities.

**Key Features:**
- Privacy-first (no offer data persistence)
- Rate limiting for abuse prevention
- Comprehensive error handling
- Request validation with Zod
- JWT authentication for admin operations

**API Version:** v1  
**Protocol:** HTTP/HTTPS  
**Data Format:** JSON (except file uploads)

## Base URL

### Development
```
http://localhost:3001/api/v1
```

### Staging
```
https://offerlens-backend-staging.railway.app/api/v1
```

### Production
```
https://api.offerlens.com/api/v1
```

## Authentication

### Public Endpoints

Most endpoints are public and don't require authentication:
- Health check
- Analysis
- Text extraction
- Feature request submission
- Feature request listing
- Metadata endpoints

### Admin Endpoints

Admin endpoints require JWT authentication:

**Header:**
```
Authorization: Bearer <jwt_token>
```

**Obtaining a Token:**

```http
POST /admin/login
Content-Type: application/json

{
  "username": "admin",
  "password": "your_password"
}
```

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d"
}
```

**Using the Token:**

```http
GET /admin/salary-benchmarks
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

## Rate Limiting

The API implements rate limiting to prevent abuse:

**Limits:**
- **Analysis endpoint:** 10 requests per minute per IP
- **Text extraction:** 5 requests per minute per IP
- **Feature requests:** 5 requests per minute per IP
- **Other endpoints:** 100 requests per minute per IP

**Rate Limit Headers:**

```http
X-RateLimit-Limit: 10
X-RateLimit-Remaining: 7
X-RateLimit-Reset: 1639584000
```

**Rate Limit Exceeded Response:**

```http
HTTP/1.1 429 Too Many Requests
Retry-After: 60

{
  "error": {
    "code": "RATE_LIMIT_EXCEEDED",
    "message": "Too many requests. Please try again in 60 seconds.",
    "timestamp": "2024-12-12T10:30:00.000Z",
    "requestId": "req_abc123"
  }
}
```

## Error Handling

### Error Response Format

All errors follow this structure:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {},
    "timestamp": "2024-12-12T10:30:00.000Z",
    "requestId": "req_abc123"
  }
}
```

### HTTP Status Codes

| Code | Meaning | Description |
|------|---------|-------------|
| 200 | OK | Request successful |
| 201 | Created | Resource created successfully |
| 400 | Bad Request | Invalid request data |
| 401 | Unauthorized | Authentication required or failed |
| 403 | Forbidden | Insufficient permissions |
| 404 | Not Found | Resource not found |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Server error |
| 503 | Service Unavailable | Service temporarily unavailable |

### Common Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Request validation failed |
| `RATE_LIMIT_EXCEEDED` | Too many requests |
| `UNAUTHORIZED` | Authentication required |
| `FORBIDDEN` | Insufficient permissions |
| `NOT_FOUND` | Resource not found |
| `FILE_TOO_LARGE` | Uploaded file exceeds size limit |
| `INVALID_FILE_TYPE` | Unsupported file type |
| `EXTRACTION_FAILED` | Text extraction failed |
| `INTERNAL_ERROR` | Internal server error |

## Endpoints

### Health Check

Check API health and availability.

#### Get Health Status

```http
GET /health
```

**Response:**

```json
{
  "status": "ok",
  "timestamp": "2024-12-12T10:30:00.000Z",
  "uptime": 123456.789
}
```

**Status Codes:**
- `200 OK` - Service is healthy
- `503 Service Unavailable` - Service is down

---

### Analysis

Analyze job offer letters for red flags, salary comparison, and negotiation suggestions.

#### Analyze Offer

```http
POST /analyze
Content-Type: application/json
```

**Request Body:**

```json
{
  "offerText": "Your complete offer letter text here...",
  "role": "Software Engineer",
  "experience": "3-5 years",
  "ctc": 25,
  "city": "Bangalore"
}
```

**Request Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `offerText` | string | Yes | Complete offer letter text (min 100 chars) |
| `role` | string | Yes | Job role (must match available roles) |
| `experience` | string | Yes | Experience level (e.g., "3-5 years") |
| `ctc` | number | Yes | Cost to Company in LPA (lakhs per annum) |
| `city` | string | Yes | City name (must match available cities) |

**Response:**

```json
{
  "redFlags": [
    {
      "id": "training-bond",
      "severity": "high",
      "title": "Training Bond Clause",
      "description": "The offer includes a training bond that requires you to pay back training costs if you leave within a specified period.",
      "excerpt": "...you will be required to serve the company for 2 years or pay back Rs. 2,00,000...",
      "keywords": ["training bond", "pay back"]
    }
  ],
  "salaryComparison": {
    "range": {
      "min": 20,
      "avg": 25,
      "max": 30
    },
    "comparison": "aligned",
    "difference": 0,
    "message": "Your offered CTC of ₹25 LPA is aligned with the market average for Software Engineer with 3-5 years experience in Bangalore."
  },
  "takeHome": 18.5,
  "negotiationSuggestions": [
    {
      "category": "red_flag",
      "priority": "high",
      "suggestion": "Request removal or reduction of the training bond clause",
      "reasoning": "Training bonds are often unenforceable and can limit your career mobility."
    },
    {
      "category": "salary",
      "priority": "medium",
      "suggestion": "Consider negotiating for the higher end of the range",
      "reasoning": "The market range goes up to ₹30 LPA for your profile."
    }
  ],
  "analysisId": "analysis_abc123"
}
```

**Response Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `redFlags` | array | List of detected red flags |
| `redFlags[].id` | string | Unique red flag identifier |
| `redFlags[].severity` | string | "high", "medium", or "low" |
| `redFlags[].title` | string | Red flag title |
| `redFlags[].description` | string | Detailed explanation |
| `redFlags[].excerpt` | string | Text excerpt that triggered detection |
| `redFlags[].keywords` | array | Matched keywords |
| `salaryComparison` | object | Salary comparison data |
| `salaryComparison.range` | object | Market salary range |
| `salaryComparison.comparison` | string | "below", "aligned", or "above" |
| `salaryComparison.difference` | number | Difference from average |
| `salaryComparison.message` | string | Human-readable comparison |
| `takeHome` | number | Estimated take-home salary in LPA |
| `negotiationSuggestions` | array | List of suggestions |
| `analysisId` | string | Temporary analysis ID (for download) |

**Status Codes:**
- `200 OK` - Analysis successful
- `400 Bad Request` - Invalid request data
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Analysis failed

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "offerText": "Dear Candidate, We are pleased to offer you the position of Software Engineer...",
    "role": "Software Engineer",
    "experience": "3-5 years",
    "ctc": 25,
    "city": "Bangalore"
  }'
```

---

### OCR/Text Extraction

Extract text from PDF and image files.

#### Extract Text from File

```http
POST /extract-text
Content-Type: multipart/form-data
```

**Request:**

```
file: <binary file data>
```

**Supported File Types:**
- PDF (`.pdf`)
- JPEG (`.jpg`, `.jpeg`)
- PNG (`.png`)
- Plain Text (`.txt`)

**File Size Limit:** 10MB

**Response:**

```json
{
  "success": true,
  "text": "Extracted text content from the file...",
  "confidence": 0.95,
  "fileType": "pdf"
}
```

**Response Schema:**

| Field | Type | Description |
|-------|------|-------------|
| `success` | boolean | Whether extraction succeeded |
| `text` | string | Extracted text content |
| `confidence` | number | Confidence score (0-1, only for OCR) |
| `fileType` | string | Detected file type |
| `error` | string | Error message (if failed) |

**Status Codes:**
- `200 OK` - Extraction successful
- `400 Bad Request` - Invalid file or no file provided
- `413 Payload Too Large` - File exceeds size limit
- `429 Too Many Requests` - Rate limit exceeded
- `500 Internal Server Error` - Extraction failed

**Example Request:**

```bash
curl -X POST http://localhost:3001/api/v1/extract-text \
  -F "file=@offer_letter.pdf"
```

**Example with JavaScript:**

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:3001/api/v1/extract-text', {
  method: 'POST',
  body: formData,
});

const result = await response.json();
```

---

### Feature Requests

Submit and manage feature requests.

#### Submit Feature Request

```http
POST /feature-requests
Content-Type: application/json
```

**Request Body:**

```json
{
  "type": "role",
  "title": "Add Data Analyst role",
  "description": "Please add salary benchmarks for Data Analyst positions",
  "userEmail": "user@example.com"
}
```

**Request Schema:**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `type` | string | Yes | "role", "feature", or "issue" |
| `title` | string | Yes | Request title (max 200 chars) |
| `description` | string | Yes | Detailed description (max 2000 chars) |
| `userEmail` | string | No | User email for updates |

**Response:**

```json
{
  "id": "req_abc123",
  "type": "role",
  "title": "Add Data Analyst role",
  "description": "Please add salary benchmarks for Data Analyst positions",
  "userEmail": "user@example.com",
  "status": "submitted",
  "votes": 0,
  "createdAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `201 Created` - Request submitted successfully
- `400 Bad Request` - Invalid request data
- `429 Too Many Requests` - Rate limit exceeded

#### List Feature Requests

```http
GET /feature-requests?status=submitted&type=role&page=1&limit=20
```

**Query Parameters:**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string | No | Filter by status |
| `type` | string | No | Filter by type |
| `page` | number | No | Page number (default: 1) |
| `limit` | number | No | Items per page (default: 20, max: 100) |

**Response:**

```json
{
  "data": [
    {
      "id": "req_abc123",
      "type": "role",
      "title": "Add Data Analyst role",
      "description": "Please add salary benchmarks for Data Analyst positions",
      "status": "submitted",
      "votes": 5,
      "createdAt": "2024-12-12T10:30:00.000Z",
      "updatedAt": "2024-12-12T10:30:00.000Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 45,
    "totalPages": 3
  }
}
```

**Status Codes:**
- `200 OK` - Requests retrieved successfully
- `400 Bad Request` - Invalid query parameters

#### Vote on Feature Request

```http
POST /feature-requests/:id/vote
```

**Path Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `id` | string | Feature request ID |

**Response:**

```json
{
  "id": "req_abc123",
  "votes": 6,
  "voted": true
}
```

**Status Codes:**
- `200 OK` - Vote recorded successfully
- `400 Bad Request` - Already voted from this IP
- `404 Not Found` - Feature request not found
- `429 Too Many Requests` - Rate limit exceeded

**Note:** Voting is limited to once per IP address per feature request.

---

### Metadata

Get available options for roles, cities, and experience levels.

#### Get Available Roles

```http
GET /roles
```

**Response:**

```json
{
  "roles": [
    "Software Engineer",
    "Senior Software Engineer",
    "Data Scientist",
    "Product Manager",
    "DevOps Engineer",
    "Frontend Developer",
    "Backend Developer",
    "Full Stack Developer",
    "Mobile Developer",
    "QA Engineer",
    "UI/UX Designer",
    "Business Analyst"
  ]
}
```

**Status Codes:**
- `200 OK` - Roles retrieved successfully

#### Get Available Cities

```http
GET /cities
```

**Response:**

```json
{
  "cities": [
    "Bangalore",
    "Mumbai",
    "Delhi NCR",
    "Hyderabad",
    "Pune",
    "Chennai",
    "Kolkata",
    "Ahmedabad",
    "Jaipur",
    "Chandigarh",
    "Kochi"
  ]
}
```

**Status Codes:**
- `200 OK` - Cities retrieved successfully

#### Get Experience Levels

```http
GET /experience-levels
```

**Response:**

```json
{
  "experienceLevels": [
    "0-1 years",
    "1-3 years",
    "3-5 years",
    "5-8 years",
    "8+ years"
  ]
}
```

**Status Codes:**
- `200 OK` - Experience levels retrieved successfully

---

### Admin

Admin endpoints for managing salary benchmarks, red flag rules, and feature requests.

**Authentication Required:** All admin endpoints require JWT authentication.

#### Admin Login

```http
POST /admin/login
Content-Type: application/json
```

**Request Body:**

```json
{
  "username": "admin",
  "password": "your_password"
}
```

**Response:**

```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiresIn": "7d",
  "user": {
    "id": "user_abc123",
    "username": "admin",
    "role": "admin"
  }
}
```

**Status Codes:**
- `200 OK` - Login successful
- `401 Unauthorized` - Invalid credentials

#### Create Salary Benchmark

```http
POST /admin/salary-benchmarks
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "role": "Software Engineer",
  "experienceLevel": "3-5 years",
  "city": "Bangalore",
  "minSalary": 20,
  "avgSalary": 25,
  "maxSalary": 30,
  "effectiveDate": "2024-01-01"
}
```

**Response:**

```json
{
  "id": "bench_abc123",
  "role": "Software Engineer",
  "experienceLevel": "3-5 years",
  "city": "Bangalore",
  "minSalary": 20,
  "avgSalary": 25,
  "maxSalary": 30,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "createdAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `201 Created` - Benchmark created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `403 Forbidden` - Insufficient permissions

#### Update Salary Benchmark

```http
PUT /admin/salary-benchmarks/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "minSalary": 22,
  "avgSalary": 27,
  "maxSalary": 32
}
```

**Response:**

```json
{
  "id": "bench_abc123",
  "role": "Software Engineer",
  "experienceLevel": "3-5 years",
  "city": "Bangalore",
  "minSalary": 22,
  "avgSalary": 27,
  "maxSalary": 32,
  "effectiveDate": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Benchmark updated successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Benchmark not found

#### Create Red Flag Rule

```http
POST /admin/red-flag-rules
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "ruleId": "training-bond",
  "severity": "high",
  "title": "Training Bond Clause",
  "description": "The offer includes a training bond...",
  "keywords": ["training bond", "pay back", "bond amount"],
  "active": true
}
```

**Response:**

```json
{
  "id": "rule_abc123",
  "ruleId": "training-bond",
  "severity": "high",
  "title": "Training Bond Clause",
  "description": "The offer includes a training bond...",
  "keywords": ["training bond", "pay back", "bond amount"],
  "active": true,
  "createdAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `201 Created` - Rule created successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `409 Conflict` - Rule ID already exists

#### Update Red Flag Rule

```http
PUT /admin/red-flag-rules/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "active": false
}
```

**Response:**

```json
{
  "id": "rule_abc123",
  "ruleId": "training-bond",
  "severity": "high",
  "title": "Training Bond Clause",
  "description": "The offer includes a training bond...",
  "keywords": ["training bond", "pay back", "bond amount"],
  "active": false,
  "updatedAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Rule updated successfully
- `400 Bad Request` - Invalid request data
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Rule not found

#### Update Feature Request Status

```http
PUT /admin/feature-requests/:id/status
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**

```json
{
  "status": "planned",
  "adminNote": "We're planning to add this in Q1 2025"
}
```

**Response:**

```json
{
  "id": "req_abc123",
  "type": "role",
  "title": "Add Data Analyst role",
  "status": "planned",
  "adminNote": "We're planning to add this in Q1 2025",
  "updatedAt": "2024-12-12T10:30:00.000Z"
}
```

**Status Codes:**
- `200 OK` - Status updated successfully
- `400 Bad Request` - Invalid status
- `401 Unauthorized` - Authentication required
- `404 Not Found` - Feature request not found

#### Bulk Import Salary Benchmarks

```http
POST /admin/salary-benchmarks/import
Authorization: Bearer <token>
Content-Type: multipart/form-data
```

**Request:**

```
file: <CSV or JSON file>
```

**CSV Format:**

```csv
role,experienceLevel,city,minSalary,avgSalary,maxSalary,effectiveDate
Software Engineer,3-5 years,Bangalore,20,25,30,2024-01-01
Data Scientist,3-5 years,Mumbai,22,28,35,2024-01-01
```

**JSON Format:**

```json
[
  {
    "role": "Software Engineer",
    "experienceLevel": "3-5 years",
    "city": "Bangalore",
    "minSalary": 20,
    "avgSalary": 25,
    "maxSalary": 30,
    "effectiveDate": "2024-01-01"
  }
]
```

**Response:**

```json
{
  "imported": 150,
  "failed": 2,
  "errors": [
    {
      "row": 5,
      "error": "Invalid salary value"
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Import completed (check errors for failures)
- `400 Bad Request` - Invalid file format
- `401 Unauthorized` - Authentication required

---

## Code Examples

### JavaScript/TypeScript

```typescript
import axios from 'axios';

const api = axios.create({
  baseURL: 'http://localhost:3001/api/v1',
  timeout: 30000,
});

// Analyze offer
const analyzeOffer = async (data) => {
  const response = await api.post('/analyze', data);
  return response.data;
};

// Extract text from file
const extractText = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  
  const response = await api.post('/extract-text', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
};

// Submit feature request
const submitFeatureRequest = async (data) => {
  const response = await api.post('/feature-requests', data);
  return response.data;
};
```

### Python

```python
import requests

BASE_URL = 'http://localhost:3001/api/v1'

# Analyze offer
def analyze_offer(data):
    response = requests.post(f'{BASE_URL}/analyze', json=data)
    return response.json()

# Extract text from file
def extract_text(file_path):
    with open(file_path, 'rb') as f:
        files = {'file': f}
        response = requests.post(f'{BASE_URL}/extract-text', files=files)
    return response.json()

# Submit feature request
def submit_feature_request(data):
    response = requests.post(f'{BASE_URL}/feature-requests', json=data)
    return response.json()
```

### cURL

```bash
# Analyze offer
curl -X POST http://localhost:3001/api/v1/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "offerText": "Your offer letter text...",
    "role": "Software Engineer",
    "experience": "3-5 years",
    "ctc": 25,
    "city": "Bangalore"
  }'

# Extract text from file
curl -X POST http://localhost:3001/api/v1/extract-text \
  -F "file=@offer_letter.pdf"

# Submit feature request
curl -X POST http://localhost:3001/api/v1/feature-requests \
  -H "Content-Type: application/json" \
  -d '{
    "type": "role",
    "title": "Add Data Analyst role",
    "description": "Please add salary benchmarks for Data Analyst"
  }'

# Admin login
curl -X POST http://localhost:3001/api/v1/admin/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "admin",
    "password": "your_password"
  }'
```

## Postman Collection

Import this collection into Postman for easy testing:

[Download Postman Collection](./postman_collection.json)

## OpenAPI/Swagger Specification

View the interactive API documentation:

**Development:**
```
http://localhost:3001/api-docs
```

**Production:**
```
https://api.offerlens.com/api-docs
```

## Changelog

### v1.0.0 (2024-12-12)
- Initial API release
- Analysis endpoint
- Text extraction endpoint
- Feature request endpoints
- Metadata endpoints
- Admin endpoints

## Support

For API support:
- **Documentation:** This file
- **Issues:** [GitHub Issues](https://github.com/yourusername/offerlens/issues)
- **Email:** api-support@offerlens.com

## License

MIT License - See LICENSE file for details
