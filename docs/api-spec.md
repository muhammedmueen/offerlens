# OfferLens — API Specification (Phase 1)

> Base URL: `/api/v1` | Format: JSON | Auth: None (Phase 1)

## Conventions

### Response Envelope

All responses follow a consistent envelope:

```typescript
// Success
{
  "success": true,
  "data": T,                    // Response payload
  "meta"?: {                    // Optional pagination/metadata
    "page": number,
    "pageSize": number,
    "total": number
  }
}

// Error
{
  "success": false,
  "error": {
    "code": string,             // Machine-readable error code
    "message": string,          // Human-readable message
    "details"?: unknown         // Optional context (validation errors, etc.)
  }
}
```

### Common Headers

| Header | Direction | Purpose |
|---|---|---|
| `Content-Type` | Response | Always `application/json` (except file uploads/downloads) |
| `X-Request-Id` | Response | Correlation ID for debugging |
| `X-Fingerprint` | Request | Client-generated browser fingerprint (guest tracking) |
| `X-RateLimit-Limit` | Response | Max requests allowed in window |
| `X-RateLimit-Remaining` | Response | Requests remaining in window |
| `X-RateLimit-Reset` | Response | Seconds until the window resets |
| `Retry-After` | Response (429) | Seconds until next request allowed |

### Error Codes

| Code | HTTP | When |
|---|---|---|
| `INVALID_FILE_TYPE` | 400 | Upload is not PDF/JPG/PNG |
| `FILE_TOO_LARGE` | 400 | File exceeds 10MB |
| `VALIDATION_ERROR` | 400 | Request body fails Zod validation |
| `INVALID_INPUT` | 400 | Malformed request (bad UUID, etc.) |
| `SPAM_DETECTED` | 400 | Feature request contains profanity/spam |
| `GUEST_RESTRICTED` | 403 | Guest tried to access registered-only feature |
| `NOT_FOUND` | 404 | Resource doesn't exist or has expired |
| `ALREADY_VOTED` | 409 | Duplicate vote on feature request |
| `FEATURE_NOT_IN_PLAN` | 403 | The caller's plan has this feature switched off. `details: { feature, plan }`. No plan switches anything off today |
| `RATE_LIMIT_EXCEEDED` | 429 | Too many requests in a short window (per-route or global rate limit). Has `Retry-After` |
| `UPLOAD_LIMIT_EXCEEDED` | 429 | Daily analysis quota used up (guest 1/day, `free` 3/day, IST calendar day). Quota `details` and `Retry-After`, see below |
| `QUOTA_EXCEEDED` | 429 | A per-feature daily cap is used up: career paths, negotiation scripts or autofill. Same `details` and `Retry-After` |
| `INTERNAL_ERROR` | 500 | Unexpected server error (never leaks details) |
| `SERVICE_UNAVAILABLE` | 503 | External API down (Vision, Gemini) |

---

## Endpoints

### Health

#### `GET /api/v1/health`

Returns server status. Counts against the global 100/min limit like any other route.

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "status": "ok",
    "version": "1.0.0",
    "uptime": 3600,
    "timestamp": "2026-02-12T12:00:00Z"
  }
}
```

---

### Quota

#### `GET /api/v1/quota`

Today's limits and usage for the caller: the signed-in user, else the guest cookie. Global rate
limit only. Read-only: a first-visit guest gets `used: 0` everywhere and no guest record is created.
`limit` and `remaining` are `null` when unlimited. `accountAnalysesPerDay` is what a `free` account
gets, for the guest sign-up prompt.

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "plan": "guest",
    "day": "2026-10-10",
    "resetAt": "2026-10-10T18:30:00.000Z",
    "quotas": {
      "analysis": { "limit": 1, "used": 0, "remaining": 1 },
      "autofill": { "limit": 30, "used": 2, "remaining": 28 },
      "career": { "limit": 0, "used": 0, "remaining": 0 },
      "negotiation": { "limit": 0, "used": 0, "remaining": 0 }
    },
    "accountAnalysesPerDay": 3
  }
}
```

Every quota resets at 00:00 IST (`resetAt`). A 429 from any quota carries `Retry-After` in seconds
until then.

---

### Offers

#### `POST /api/v1/offers`

Upload an offer letter for analysis. Accepts multipart/form-data.

**Daily quota**: guest 1, `free` 3, `unlimited` none (IST calendar day, see `GET /quota`) | **Rate limit**: global 100/min, no route-specific limit

**Request** (`multipart/form-data`):

| Field | Type | Required | Constraints |
|---|---|---|---|
| `file` | File | ✅ | PDF, JPG, PNG. Max 10MB |
| `role` | string | ❌ | Closest matching job role |
| `experienceYears` | number | ❌ | Years of experience (0-50) |
| `city` | string | ❌ | City name |
| `expectedCTC` | number | ❌ | Expected salary (in currency unit) |
| `currency` | string | ❌ | ISO currency code, default: `INR` |

**Response** `202 Accepted`:
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "QUEUED",
    "createdAt": "2026-02-12T12:00:00Z",
    "expiresAt": "2026-02-13T12:00:00Z",
    "isGuest": true,
    "estimatedProcessingTime": 15
  }
}
```

**Error responses**:

| Scenario | Code | Response |
|---|---|---|
| Wrong file type | 400 | `{ code: "INVALID_FILE_TYPE", message: "Please upload a PDF or image (JPG, PNG)" }` |
| File too large | 400 | `{ code: "FILE_TOO_LARGE", message: "File must be under 10MB" }` |
| Daily analysis quota used | 429 | `UPLOAD_LIMIT_EXCEEDED`, example below |

Quota 429 (`Retry-After: 3600` = seconds until 00:00 IST):

```json
{
  "success": false,
  "error": {
    "code": "UPLOAD_LIMIT_EXCEEDED",
    "message": "Daily analysis limit reached (1 per day). Resets at 00:00 IST.",
    "details": {
      "feature": "analysis",
      "limit": 1,
      "used": 1,
      "remaining": 0,
      "resetAt": "2026-10-10T18:30:00.000Z",
      "plan": "guest"
    }
  }
}
```

The slot is reserved when the upload is queued and refunded if the analysis ends FAILED. A
duplicate of an offer that did not fail is returned without charging.

---

#### `GET /api/v1/offers/:id`

Get offer status and basic info. Used for polling during processing.

**Rate limit**: global 100/min, no route-specific limit (the app polls every 3 s, about 20/min)

**Path params**: `id` — offer UUID

**Response** `200` (while processing):
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "PROCESSING",
    "createdAt": "2026-02-12T12:00:00Z",
    "expiresAt": "2026-02-13T12:00:00Z",
    "isGuest": true,
    "ocrConfidence": null,
    "hasAnalysis": false
  }
}
```

**Response** `200` (completed):
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "COMPLETED",
    "createdAt": "2026-02-12T12:00:00Z",
    "expiresAt": "2026-02-13T12:00:00Z",
    "isGuest": true,
    "ocrConfidence": 0.92,
    "lowConfidence": false,
    "hasAnalysis": true
  }
}
```

**Response** `200` (failed):
```json
{
  "success": true,
  "data": {
    "id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "status": "FAILED",
    "failureReason": "We couldn't read this file. Please try a clearer scan or paste the text manually.",
    "createdAt": "2026-02-12T12:00:00Z"
  }
}
```

**Errors**: `NOT_FOUND` (404) — offer doesn't exist or guest TTL expired.

---

#### `GET /api/v1/offers/:id/analysis`

Get full analysis results. Only available when `status = COMPLETED`.

**Rate limit**: global 100/min, no route-specific limit

**Path params**: `id` — offer UUID

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "offerId": "a1b2c3d4-...",
    "score": 72,
    "scoreLabel": "good",
    "scoringMethod": "standard",
    "lowConfidence": false,

    "extractedData": {
      "companyName": "TechCorp India Pvt Ltd",
      "role": "Senior Software Engineer",
      "department": "Engineering",
      "joiningDate": "2026-04-01",
      "location": "Bangalore",
      "employmentType": "full-time",
      "compensation": {
        "currency": "INR",
        "baseSalary": { "amount": 1200000, "period": "annual" },
        "variablePay": { "amount": 200000, "type": "performance", "details": "Based on annual review" },
        "equity": { "type": "ESOP", "quantity": 500, "vestingSchedule": "4 years with 1-year cliff", "strikePrice": 100, "cliffMonths": 12 },
        "totalCTC": 1800000,
        "otherComponents": [
          { "name": "Joining Bonus", "amount": 100000, "details": "One-time" }
        ]
      },
      "noticePeriod": "90 days",
      "probationPeriod": "6 months"
    },

    "redFlags": [
      {
        "type": "bond",
        "severity": "high",
        "title": "2-Year Service Bond",
        "explanation": "You must stay for 2 years or repay ₹2,00,000. This limits your career flexibility.",
        "matchedText": "employee agrees to serve for a minimum period of 24 months failing which a sum of Rs. 2,00,000 shall be payable",
        "suggestion": "Negotiate to remove the bond or reduce the penalty amount"
      }
    ],

    "salaryComparison": {
      "marketRange": { "p25": 1400000, "p50": 1800000, "p75": 2200000, "p90": 2800000 },
      "offerPercentile": 42,
      "roleUsed": "Senior Software Engineer",
      "roleMatchConfidence": 0.95,
      "locationUsed": "Bangalore, India",
      "dataSource": "ai_estimated",   // or "crowdsourced" (unverified; confidence level medium, badge "Check this", never "Verified") | "public_survey" (modelled, India-wide; ODbL attribution required)
      // 5.1b, public_survey in a metro: "benchmarkScope" is "role_experience_city_adjusted" | "role_city_adjusted", "locationUsed" is "India (national), adjusted for Mumbai", and an optional
      // "cityAdjustment": { "source": "plfs_2023_24", "city": "mumbai", "cityLabel": "Mumbai", "factor": 0.79, "plfsSampleSize": 31, "period": "2023-24" } says the survey figures were scaled by that factor.
      // The disclaimer then states plainly that it is an estimate, not offers in the city. Absent for crowdsourced, AI-estimated and non-metro results; confidence stays medium.
      // Optional, additive. public_survey: "percentileWithheld": "no_experience_rows" => range shown, offerPercentile null, salary unscored (a Fresher offer).
      // crowdsourced: "payBasis": "offered" | "current" | "mixed" and, when "mixed", "payMix": { "offered": 9, "current": 4, "unlabelled": 2 } (sums to sampleSize).
      "disclaimer": null
    },

    "negotiationSuggestions": [
      {
        "component": "Base Salary",
        "currentValue": "₹12,00,000/year",
        "suggestedAsk": "₹15,00,000/year",
        "rationale": "Your offer is at p42. The market median (p50) for this role in Bangalore is ₹18L CTC.",
        "priority": "high"
      }
    ],

    "benefits": [
      { "name": "Health Insurance", "value": "₹5,00,000 family floater", "details": "Employer-provided", "isStandard": true },
      { "name": "PF", "value": "12% of basic", "details": "Statutory", "isStandard": true },
      { "name": "Gratuity", "value": "As per statute", "details": null, "isStandard": true }
    ],

    "takeHome": {
      "monthlyEstimate": 78500,
      "assumptions": "Assuming old tax regime, no HRA exemption, standard deduction applied"
    },

    "metadata": {
      "analysisVersion": "1.0",
      "modelUsed": "gemini-2.0-flash",
      "processingNote": null
    },

    "processingTimeMs": 12340,
    "redFlagsDiscarded": 1,
    "createdAt": "2026-02-12T12:00:15Z"
  }
}
```

**Errors**:
- `NOT_FOUND` (404) — offer doesn't exist or not yet completed
- If `status` is `QUEUED` or `PROCESSING`, returns 404 with message: `"Analysis is still processing. Check back shortly."`

---

#### `DELETE /api/v1/offers/:id`

Delete an offer and its analysis permanently.

**Rate limit**: global 100/min, no route-specific limit

**Path params**: `id` — offer UUID

**Response** `200`:
```json
{
  "success": true,
  "data": { "deleted": true }
}
```

**Errors**: `NOT_FOUND` (404)

---

#### `GET /api/v1/offers/:id/report`

Download PDF report of the analysis.

**Rate limit**: global 100/min, no route-specific limit

**Path params**: `id` — offer UUID

**Response** `200`:
- `Content-Type: application/pdf`
- `Content-Disposition: attachment; filename="offerlens-report-{offerId}.pdf"`
- Binary PDF body

**Errors**:
- `NOT_FOUND` (404) — offer doesn't exist or analysis not complete
- `GUEST_RESTRICTED` (403) — guest users cannot download reports (Phase 1 note: currently allowed for all; this gate activates only if we add restrictions)

---

#### `GET /api/v1/offers/:id/career-path`
Career narrative plus a pay-by-experience table for the offer's role family. Registered users only (`careerPath` gate).
**Rate limit**: global 100/min; counts against the daily `career` cap on a narrative cache miss (a hit is free, a failed generation is given back)
**Path params**: `id` - offer UUID
**Response** `200` (`data`):
```json
{
  "timeline": [{ "year": 1, "title": "...", "focus": "..." }],
  "skillsToLearn": ["..."],
  "potentialRoles": ["..."],
  "error": "only present when the AI failed; timeline and lists are then empty",
  "progression": {
    "applicable": true,
    "roleUsed": "Backend Engineer",
    "cityUsed": "Bangalore",
    "referenceFamilies": ["Backend Engineer"],
    "currentBracket": "Mid-Level (3-5 yrs)",
    "cells": [
      { "bracket": "Fresher (0-1 yrs)", "yearsRange": { "min": 0, "max": 0 }, "sampleSize": 0, "crowdN": 0, "source": null, "marketRange": null, "step": null },
      { "bracket": "Junior (1-3 yrs)", "yearsRange": { "min": 1, "max": 2 }, "sampleSize": 37, "crowdN": 0, "source": "public_survey", "marketRange": { "p25": 400000, "p50": 700000, "p75": 1200000 }, "step": null },
      { "bracket": "Mid-Level (3-5 yrs)", "yearsRange": { "min": 3, "max": 4 }, "sampleSize": 39, "crowdN": 0, "source": "public_survey", "marketRange": { "p25": 805000, "p50": 1300000, "p75": 2175000 }, "step": { "absolute": 600000, "percent": 86 } }
    ],
    "notes": [{ "source": "public_survey", "disclaimer": "Modelled from public surveys, not offers in your city. ..." }]
  }
}
```
`progression` is always present on a 200 and is computed on every request (never cached). It is `{ "applicable": false, "reason": ... }` with no figures when `reason` is `role_not_covered` (outside the eight surveyed software role families), `non_inr`, `city_not_covered` (not one of the six metros) or `lookup_error`.
Each cell is one experience bracket (the same half-open brackets the offer benchmark uses). `source` is `crowdsourced` (role + city, n >= 10 after outlier rejection), else `public_survey` (role family, India-wide, n >= 10), else `null` with `marketRange: null` (no number is ever filled in). For a `null` cell `sampleSize` is the survey row count and `crowdN` the crowdsourced count. Sources are never pooled. `step` is the change in median from the previous bracket, set only when both cells have numbers from the same source. Amounts are annual INR. Cross-sectional: each row is different people.
**Changed in 5.1b (additive)**: when the offer's metro has a PLFS 2023-24 city factor, `progression.cityAdjustment` (same shape as `salaryComparison.cityAdjustment`) is set, every `public_survey` cell is the national survey figure x the factor (`sampleSize` is still the survey n; step percentages are unchanged, step amounts scale), the survey note names the city, the factor and the PLFS n, and `crowdsourced` cells are never scaled. With no factor row the field is absent and the response is exactly as before.
**Changed in 5.5**: `timeline[].salaryRange` is no longer returned (the model no longer authors pay figures). `progression` is new and additive. If the model's prose carries a pay figure (a heuristic scan, not a proof), the narrative is dropped like any unusable result: `error` is set, the lists are empty, `progression` is still returned, and nothing is cached.
**Errors**: `NOT_FOUND` (404), `OFFER_NOT_READY` (400), `INVALID_INPUT` (400, no role identified), `FEATURE_NOT_IN_PLAN` (403), `QUOTA_EXCEEDED` (429)
---

### Metadata

#### `GET /api/v1/metadata/roles`

List all available job roles for dropdown.

**Rate limit**: global 100/min, no route-specific limit | **Cache**: Redis, 1h TTL

**Query params**:

| Param | Type | Default | Description |
|---|---|---|---|
| `category` | string | — | Filter by category (engineering, design, etc.) |
| `q` | string | — | Search by name (case-insensitive, prefix match) |

**Response** `200`:
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Software Engineer", "category": "engineering" },
    { "id": 2, "name": "Senior Software Engineer", "category": "engineering" },
    { "id": 3, "name": "Product Manager", "category": "product" }
  ]
}
```

---

#### `GET /api/v1/metadata/cities`

List available cities for dropdown.

**Rate limit**: global 100/min, no route-specific limit | **Cache**: Redis, 1h TTL

**Query params**:

| Param | Type | Default | Description |
|---|---|---|---|
| `country` | string | — | Filter by country |
| `q` | string | — | Search by name (prefix match) |

**Response** `200`:
```json
{
  "success": true,
  "data": [
    { "id": 1, "name": "Bangalore", "state": "Karnataka", "country": "India" },
    { "id": 2, "name": "Mumbai", "state": "Maharashtra", "country": "India" },
    { "id": 3, "name": "San Francisco", "state": "California", "country": "USA" }
  ]
}
```

---

#### `GET /api/v1/metadata/experience-levels`

List experience levels for dropdown.

**Rate limit**: global 100/min, no route-specific limit | **Cache**: Redis, 1h TTL

**Response** `200`:
```json
{
  "success": true,
  "data": [
    { "id": 1, "label": "Fresher", "minYears": 0, "maxYears": 1 },
    { "id": 2, "label": "Junior", "minYears": 1, "maxYears": 3 },
    { "id": 3, "label": "Mid", "minYears": 3, "maxYears": 5 },
    { "id": 4, "label": "Senior", "minYears": 5, "maxYears": 8 },
    { "id": 5, "label": "Staff", "minYears": 8, "maxYears": 12 },
    { "id": 6, "label": "Principal", "minYears": 12, "maxYears": 99 }
  ]
}
```

---

### Feature Requests

#### `POST /api/v1/feature-requests`

Submit a feature request.

**Rate limit**: global 100/min, no route-specific limit

**Request body** (`application/json`):

```json
{
  "title": "Dark mode support",
  "description": "Add a dark mode toggle for late-night offer review sessions"
}
```

| Field | Type | Required | Constraints |
|---|---|---|---|
| `title` | string | ✅ | 5-200 characters |
| `description` | string | ✅ | 20-2000 characters |

**Response** `201`:
```json
{
  "success": true,
  "data": {
    "id": "b2c3d4e5-...",
    "title": "Dark mode support",
    "description": "Add a dark mode toggle for late-night offer review sessions",
    "status": "open",
    "voteCount": 0,
    "createdAt": "2026-02-12T12:00:00Z"
  }
}
```

**Errors**:
- `VALIDATION_ERROR` (400) — title/description too short/long
- `SPAM_DETECTED` (400) — profanity filter triggered
- `RATE_LIMIT_EXCEEDED` (429)

---

#### `GET /api/v1/feature-requests`

List feature requests with sorting and pagination.

**Rate limit**: global 100/min, no route-specific limit

**Query params**:

| Param | Type | Default | Description |
|---|---|---|---|
| `sort` | string | `votes` | Sort by: `votes` (most voted), `newest`, `oldest` |
| `status` | string | — | Filter by status: `open`, `planned`, `in_progress`, `done`, `rejected` |
| `page` | number | 1 | Page number (1-indexed) |
| `pageSize` | number | 20 | Items per page (max 50) |

**Response** `200`:
```json
{
  "success": true,
  "data": [
    {
      "id": "b2c3d4e5-...",
      "title": "Dark mode support",
      "description": "Add a dark mode toggle...",
      "status": "open",
      "voteCount": 42,
      "hasVoted": true,
      "createdAt": "2026-02-12T12:00:00Z"
    }
  ],
  "meta": {
    "page": 1,
    "pageSize": 20,
    "total": 3
  }
}
```

> `hasVoted` is determined by matching the `X-Fingerprint` header against `feature_request_votes`. If no fingerprint is provided, it's always `false`.

---

#### `POST /api/v1/feature-requests/:id/vote`

Vote on a feature request. One vote per fingerprint.

**Rate limit**: global 100/min, no route-specific limit

**Path params**: `id` — feature request UUID

**Request body**: None (empty POST)

**Response** `200`:
```json
{
  "success": true,
  "data": {
    "featureRequestId": "b2c3d4e5-...",
    "voteCount": 43,
    "voted": true
  }
}
```

**Errors**:
- `NOT_FOUND` (404) — feature request doesn't exist
- `ALREADY_VOTED` (409) — `{ code: "ALREADY_VOTED", message: "You've already voted on this request" }`

---

## Rate Limit Summary

| Endpoint | Limit | Window |
|---|---|---|
| `POST /offers` (daily quota, not a rate limit) | guest 1, `free` 3, `unlimited` none | IST calendar day |
| `POST /auth/signup` | 5 | 1 hour |
| `POST /auth/login`, per browser cookie (per client IP when the request has no cookie) | 10 | 15 minutes |
| `POST /auth/login`, per client IP (any cookie) | 30 | 15 minutes |
| `POST /auth/login`, per email address (normalised, any browser or IP) | 10 | 15 minutes |
| `POST /auth/google` (per browser cookie only; no email limit) | 10 | 15 minutes |
| `POST /offers/extract` | 20 | 1 hour |
| `POST /offers/extract-file` | 10 | 1 hour |
| `POST /offers/:id/negotiate` | 10 | 1 hour |
| `POST /offers/compare` | 20 | 1 hour |
| `POST /offers/:id/benefits` | 60 | 1 hour |
| `GET /account/export` | 5 | 1 hour |
| `GET /salaries/stats` | 30 | 1 minute |
| Every other route (offer polling, analysis, report, delete, metadata, forum, feature requests, `/auth/refresh`, `/health`, ...) | 100 | 1 minute |

Each row is its own bucket per caller, and a route with its own limit does not also count against the global 100/min.

**Who is counted.** A signed-in user is counted by account, so clearing cookies or switching device does not reset the budget.
Anyone else is counted by their signed `ol_guest` cookie (one bucket per browser, not per network). A request that arrives
without a valid cookie is counted by client IP instead, so a script that drops cookies cannot get a fresh budget per request.
Behind a reverse proxy, cookie-less clients are counted by the proxy address unless Fastify `trustProxy` is set (see DEPLOYMENT.md).

**Login has three limits, all on `POST /auth/login`.** They are separate buckets and any one can answer 429.
- The per-email limit counts attempts since the last successful login for that address (a success clears it). The address is
  trimmed, lower-cased and hashed (sha256) before it reaches Redis or a log; the raw address is never stored or logged.
  It treats an unregistered address exactly like a registered one, and the 429 is the same body for every address and for
  all three limits, so it does not reveal whether an account exists. (`POST /auth/signup` still answers 409 for an existing
  address; that is separate and unchanged.)
- `POST /auth/google` has no email in its body, so only the per-cookie limit applies to it.
- A 400 (invalid body) spends neither the per-IP nor the per-email limit. A request stopped by one limit does not spend the next.
- A legitimate login still works from another browser and IP while one address, cookie or IP is locked.
- Accepted trade-offs: people behind one shared network share the 30-per-IP allowance, and anyone can lock another person's
  login by failing 10 times against their email (even the right password gets 429 until the 15-minute window ends). The lock is
  on this route only, never on the account, Google login or an issued token.

**What a rate-limit 429 looks like.** `{ "success": false, "error": { "code": "RATE_LIMIT_EXCEEDED", "message": "..." } }` with
`Retry-After`, `X-RateLimit-Limit`, `X-RateLimit-Remaining` (0) and `X-RateLimit-Reset`. It is a short-window "slow down" and is
different from the daily quota 429s (`UPLOAD_LIMIT_EXCEEDED`, `QUOTA_EXCEEDED`), which carry `details` and reset at 00:00 IST.

---

## Pagination

All list endpoints use offset pagination:

```
GET /api/v1/feature-requests?page=2&pageSize=10
```

**Rules**:
- `page` starts at 1 (not 0)
- `pageSize` max is 50
- Response includes `meta.total` for client-side page count
- Default `pageSize` is 20

> **Phase 2 consideration**: Switch to cursor pagination for `offers` history when volumes grow. Offset is fine for Phase 1.

---

## Versioning

- All endpoints are prefixed with `/api/v1/`
- Non-breaking changes (new fields, new endpoints) stay on `v1`
- Breaking changes (removed fields, changed types) bump to `v2`
- Old versions are supported for 6 months after deprecation notice
- Deprecation communicated via `Sunset` response header

---

## Phase 2 Endpoint Preview

These endpoints will be added in Phase 2 — listed here for frontend planning:

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v2/auth/register` | Email/password registration |
| `POST` | `/api/v2/auth/login` | JWT login |
| `POST` | `/api/v2/auth/google` | Google OAuth |
| `GET` | `/api/v2/offers` | List user's offer history |
| `POST` | `/api/v2/offers/compare` | Compare 2-5 offers side-by-side |
| `GET` | `/api/v2/offers/:id/script` | Generate negotiation email script |
| `GET` | `/api/v2/offers/:id/career` | Career path insights |
| `POST` | `/api/v2/payments/pass` | Purchase Job Hunt Pass |
| `GET` | `/api/v2/account` | User profile |
| `DELETE` | `/api/v2/account` | Delete account + all data |
| `GET` | `/api/v2/account/export` | GDPR data export |
