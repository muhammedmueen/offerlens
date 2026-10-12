# OfferLens API Documentation

**Base URL**: \`http://localhost:5000/api/v1\` (Development)

## Authentication

Most endpoints require a Bearer token.
Header: \`Authorization: Bearer <token>\`

## Response Format

Success:
\`\`\`json
{
  "success": true,
  "data": { ... }
}
\`\`\`

Error:
\`\`\`json
{
  "statusCode": 400,
  "error": "Bad Request",
  "message": "Error description",
  "code": "ERROR_CODE"
}
\`\`\`

---

## 1. Authentication (`/auth`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/auth/signup` | Create a new account | No |
| `POST` | `/auth/login` | Login with email/password | No |
| `POST` | `/auth/google` | Login/Signup with Google | No |
| `POST` | `/auth/refresh` | Refresh access token | No |
| `POST` | `/auth/logout` | Logout user | Yes |

## 2. User Profile (`/users`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/users/me` | Get current user profile | Yes |
| `GET` | `/users/me/offers` | Get user's offer history | Yes |
| `GET` | `/users/me/dashboard` | Get dashboard statistics | Yes |
| `DELETE` | `/users/me` | Delete account | Yes |

### Query Parameters for `/users/me/offers`
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 20)
- `sort`: `createdAt` (default), `score`, `status`

## 3. Offers (`/offers`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/offers` | Upload offer letter for analysis | Optional (Guest/User) |
| `GET` | `/offers/:id` | Get offer details | No (if guest) / Yes |
| `POST` | `/offers/:id/analyze` | Re-analyze or update offer | No (if guest) / Yes |
| `DELETE` | `/offers/:id` | Delete an offer | No (if guest) / Yes |
| `GET` | `/offers/:id/analysis` | Get AI analysis results | No (if guest) / Yes |
| `GET` | `/offers/:id/report` | Download PDF report | No (if guest) / Yes |

## 4. Salaries (`/salaries`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/salaries` | Submit anonymous salary data | No |
| `GET` | `/salaries/stats` | Get aggregated market stats | No |

### Query Parameters for `/salaries/stats`
- `role`: Job role (required)
- `city`: City location (required)

Rate limit: 30/min per signed-in user, guest cookie or (cookie-less) IP; the 31st call in a window gets a 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` (checked live, see the PLAN's rate-limiter outcome; all limits are in api-spec.md). With enough data the response holds `count`, `dataSource` (`crowdsourced` or
`public_survey`), `scope` (`role_city`, `role_experience_national`, `role_national`), `role`, `city`,
`locationUsed`, `p25`, `p50`, `p75`, `p90`. Otherwise `dataSource` is `null`, `data` is `null` and `count`
is the number of crowdsourced submissions so far. `public_survey` is a modelled, India-wide benchmark from
the Stack Overflow Developer Survey 2025 (ODbL), not offers in the requested city.

## 5. Forum (`/forum`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/forum/posts` | List forum posts | No |
| `POST` | `/forum/posts` | Create a new post | Yes |
| `GET` | `/forum/posts/:id` | Get single post details | No |
| `POST` | `/forum/posts/:id/comments` | Add comment to post | Yes |

### Query Parameters for `/forum/posts`
- `page`: Page number (default: 1)
- `category`: Filter by category (optional)

## 6. Negotiation (`/offers/:id/negotiate`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/offers/:id/negotiate` | Generate negotiation script | Yes (Registered Only) |

### Request Body
\`\`\`json
{
  "tone": "professional" | "assertive" | "friendly",
  "focusAreas": ["salary", "joining_bonus", "benefits"]
}
\`\`\`

## 7. Metadata (`/metadata`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/metadata/roles` | Get list of job roles | No |
| `GET` | `/metadata/cities` | Get list of cities | No |
| `GET` | `/metadata/experience-levels` | Get experience level options | No |

### Query Parameters
- `roles`: `q` (search), `category`
- `cities`: `q` (search), `country`

## 8. Feature Requests (`/feature-requests`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/feature-requests` | List feature requests | No |
| `POST` | `/feature-requests` | Submit a feature request | No |
| `POST` | `/feature-requests/:id/vote` | Vote for a request | No |

### Query Parameters for List
- `page`, `pageSize`, `sort` ('votes', 'newest'), `status`

## 9. Tools & Utilities

### Benefits (`/offers/:id/benefits`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/offers/:id/benefits` | Calculate/Override benefits | Yes |

### Career Path (`/offers/:id/career-path`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/offers/:id/career-path` | Generate career progression based on offer | Yes |

### Comparison (`/offers/compare`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `POST` | `/offers/compare` | Compare 2-3 offers side-by-side | Yes |

### Corrections (`/offers/:id/corrections`)
| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/offers/:id/corrections` | Get applied corrections | Yes |
| `PATCH` | `/offers/:id/corrections` | Apply manual data corrections | Yes |

## 10. System Health (`/health`)

| Method | Endpoint | Description | Auth Required |
| :--- | :--- | :--- | :--- |
| `GET` | `/health` | Check system status & version | No |
