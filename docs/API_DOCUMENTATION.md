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
| `POST` | `/auth/login` | Login with email/password. Rate limited per browser cookie (10), per IP (30) and per email (10), each per 15 minutes; any of them answers `429 RATE_LIMIT_EXCEEDED` with `Retry-After`. See `api-spec.md` | No |
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
| `POST` | `/salaries` | Submit salary data (stored without your name or account) | No |
| `GET` | `/salaries/stats` | Get aggregated market stats | No |

`POST /salaries` body: `role`, `city`, `experienceYears` (0-60), `ctc` (positive integer, up to 1,000,000,000),
`companyType` (`product` | `service` | `startup` | `mnc` | `other`), an optional `companySize` and an optional
`payBasis` (`current` | `offered`; omit it for "Not sure", it is stored as NULL; `null`, `""` or any other value is a 400).
The results-page card sends `offered`; the Salary Explorer form asks. Nothing else is read. The stored row carries no user, guest, fingerprint, offer or company: role and city are saved as canonical
keys, and `created_at` / `updated_at` are coarsened to the UTC day. One submission per browser per hour (a Redis
cooldown keyed on a hash of the guest cookie, not stored on the row). The repeat gets a 429 with code
`RATE_LIMIT_EXCEEDED` and `error.details.reason = "ALREADY_SUBMITTED"`, so a client can tell it from the global
limiter's 429 (same code, no `details.reason`). A submission is used in a benchmark only once the role and city
have 10 approved rows after outlier rejection. The Salary Explorer dialog and the results-page contribution card
(task 5.4) both call this one endpoint with the same body. The figure is whatever CTC the contributor enters
(often an offered, not a current, figure); nothing verifies it.

### Query Parameters for `/salaries/stats`
- `role`: Job role (required)
- `city`: City location (required)

Rate limit: 30/min per signed-in user, guest cookie or (cookie-less) IP; the 31st call in a window gets a 429 `RATE_LIMIT_EXCEEDED` with `Retry-After` (checked live, see the PLAN's rate-limiter outcome; all limits are in api-spec.md). With enough data the response holds `count`, `dataSource` (`crowdsourced` or
`public_survey`), `scope` (`role_city`, `role_experience_national`, `role_national`), `role`, `city`,
`locationUsed`, `p25`, `p50`, `p75`, `p90`. Otherwise `dataSource` is `null`, `data` is `null` and `count`
is the number of crowdsourced submissions so far. A crowdsourced result also carries `payBasis` and `payMix`, and every
result carries a `disclaimer`. The Explorer prefers `current`-pay rows (10 or more after outlier rejection); otherwise it pools
every approved row (including unlabelled ones) when that set has 10 or more, with `payBasis: "mixed"` and
`payMix: { offered, current, unlabelled }` (sums to `count`); otherwise the survey tiers. Offer analysis prefers `offered` rows
the same way. `public_survey` is a modelled, India-wide benchmark from
the Stack Overflow Developer Survey 2025 (ODbL), not offers in the requested city.

For the six metros the survey tiers may carry a city factor derived from PLFS 2023-24 (National Statistics Office, MoSPI; table `city_pay_factors`). Then `scope` is
`role_experience_city_adjusted` or `role_city_adjusted`, `locationUsed` reads "India (national), adjusted for <City>", the percentiles are the national survey figures times the factor,
and the response has an additional optional `cityAdjustment` `{ source, city, cityLabel, factor, plfsSampleSize, period }`. The `disclaimer` says it is an estimate and not offers in the city.
The same fields appear on `salaryComparison` in the analysis responses and the PDF carries the PLFS citation. Crowdsourced and non-metro results never have `cityAdjustment`.

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
| `GET` | `/offers/:id/career-path` | Career narrative (`timeline`, `skillsToLearn`, `potentialRoles`) plus a deterministic `progression`: pay by experience bracket (median, 25th-75th, n, step) from the Stack Overflow India survey, or crowdsourced rows where a role + city + bracket has n >= 10. A bracket with fewer than 10 points has `marketRange: null` and its n; an unmapped role, non-INR offer or non-metro city gets `progression.applicable: false` with a `reason`. `progression` is recomputed on every call; the AI no longer returns `salaryRange`. When the offer's metro has a PLFS city factor, survey cells are scaled by it and `progression.cityAdjustment` is set (5.1b). See `api-spec.md`. | Yes |

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
