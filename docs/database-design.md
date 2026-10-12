# OfferLens — Database Design

> PostgreSQL 16 + Drizzle ORM. Schema for Phase 1 with extension points for Phase 2/3.

## Entity Relationship Diagram

```mermaid
erDiagram
    guests ||--o{ offers : "uploads"
    offers ||--o| analyses : "has"
    offers ||--o{ offer_files : "has"
    feature_requests ||--o{ feature_request_votes : "has"

    guests {
        uuid id PK
        text fingerprint UK
        inet ip_address
        int analysis_count
        timestamptz first_seen
        timestamptz last_seen
    }

    offers {
        uuid id PK
        uuid guest_id FK "nullable"
        text raw_text
        text text_hash UK "SHA-256"
        float ocr_confidence
        enum status "QUEUED|PROCESSING|COMPLETED|FAILED"
        jsonb user_context "role, city, exp"
        text failure_reason "nullable"
        boolean is_guest
        timestamptz expires_at "nullable, guest TTL"
        timestamptz created_at
        timestamptz updated_at
    }

    offer_files {
        uuid id PK
        uuid offer_id FK
        text original_name
        text stored_path
        text mime_type
        int file_size_bytes
        boolean is_deleted "true after OCR"
        timestamptz created_at
        timestamptz deleted_at "nullable"
    }

    analyses {
        uuid id PK
        uuid offer_id FK UK
        int score "0-100"
        text score_label "excellent|good|fair|weak|poor"
        enum scoring_method "standard|fallback"
        jsonb extracted_data
        jsonb red_flags
        jsonb salary_comparison
        jsonb negotiation_suggestions
        jsonb benefits
        jsonb take_home "nullable"
        jsonb metadata
        boolean low_confidence "OCR < 60%"
        int red_flags_discarded "hallucination count"
        timestamptz created_at
    }

    feature_requests {
        uuid id PK
        text title
        text description
        enum status "open|planned|in_progress|done|rejected"
        int vote_count "denormalized"
        text submitted_by_fingerprint
        inet submitted_by_ip
        timestamptz created_at
    }

    feature_request_votes {
        uuid id PK
        uuid feature_request_id FK
        text fingerprint
        inet ip_address
        timestamptz created_at
    }

    metadata_roles {
        serial id PK
        text name UK
        text category
    }

    metadata_cities {
        serial id PK
        text name
        text state "nullable"
        text country
    }

    metadata_experience_levels {
        serial id PK
        text label UK
        int min_years
        int max_years
    }

    analytics_events {
        uuid id PK
        text event
        uuid guest_id "nullable FK"
        jsonb properties
        inet ip_address
        timestamptz created_at
    }
```

---

## Table Definitions

### `guests`

Tracks anonymous visitors by browser fingerprint.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `fingerprint` | `text` | UNIQUE, NOT NULL | Client-generated fingerprint |
| `ip_address` | `inet` | NOT NULL | Last known IP |
| `analysis_count` | `integer` | NOT NULL, default 0 | Today's upload count (reset daily) |
| `daily_reset_at` | `timestamptz` | NOT NULL | When to reset `analysis_count` |
| `first_seen` | `timestamptz` | NOT NULL, default `now()` | |
| `last_seen` | `timestamptz` | NOT NULL, default `now()` | Updated on each request |

**Phase 2 extension**: Add `user_id` FK when auth is introduced, for guest → user migration.

---

### `offers`

Core table — one row per uploaded offer letter.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `guest_id` | `uuid` | FK → `guests.id`, nullable | NULL for authenticated users (Phase 2) |
| `raw_text` | `text` | nullable | Extracted text from OCR |
| `text_hash` | `text` | nullable | SHA-256 of `raw_text` (duplicate detection) |
| `ocr_confidence` | `real` | nullable | 0.0 - 1.0 from Cloud Vision |
| `status` | `text` | NOT NULL, default `'QUEUED'` | QUEUED → PROCESSING → COMPLETED / FAILED |
| `user_context` | `jsonb` | nullable | See [User Context Shape](#user-context-jsonb) |
| `failure_reason` | `text` | nullable | Human-readable failure message |
| `is_guest` | `boolean` | NOT NULL, default `true` | |
| `expires_at` | `timestamptz` | nullable | Guest: `created_at + 24h`, registered: NULL |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `updated_at` | `timestamptz` | NOT NULL, default `now()` | |

**Phase 2 extension**: Add `user_id uuid FK → users.id` (nullable).

---

### `offer_files`

Physical file tracking — separate from `offers` so file lifecycle is independent.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `offer_id` | `uuid` | FK → `offers.id`, NOT NULL, ON DELETE CASCADE | |
| `original_name` | `text` | NOT NULL | User's filename |
| `stored_path` | `text` | NOT NULL | Server path or S3 key |
| `mime_type` | `text` | NOT NULL | `application/pdf`, `image/png`, etc. |
| `file_size_bytes` | `integer` | NOT NULL | |
| `is_deleted` | `boolean` | NOT NULL, default `false` | Set `true` after OCR extraction |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |
| `deleted_at` | `timestamptz` | nullable | When file was physically deleted |

> **Privacy**: Files are deleted from storage after OCR. `is_deleted = true` + `deleted_at` provide an audit trail. Only `raw_text` is retained.

---

### `analyses`

AI analysis results — one per offer (1:1 relationship).

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `offer_id` | `uuid` | FK → `offers.id`, UNIQUE, ON DELETE CASCADE | 1:1 with offer |
| `score` | `integer` | NOT NULL, CHECK 0-100 | Composite score |
| `score_label` | `text` | NOT NULL | excellent / good / fair / weak / poor |
| `scoring_method` | `text` | NOT NULL, default `'standard'` | standard / fallback |
| `extracted_data` | `jsonb` | NOT NULL | See [Extracted Data Shape](#extracted-data-jsonb) |
| `red_flags` | `jsonb` | NOT NULL, default `'[]'` | See [Red Flags Shape](#red-flags-jsonb) |
| `salary_comparison` | `jsonb` | NOT NULL | See [Salary Comparison Shape](#salary-comparison-jsonb) |
| `negotiation_suggestions` | `jsonb` | NOT NULL, default `'[]'` | See [Negotiation Shape](#negotiation-suggestions-jsonb) |
| `benefits` | `jsonb` | NOT NULL, default `'[]'` | See [Benefits Shape](#benefits-jsonb) |
| `take_home` | `jsonb` | nullable | `{ monthlyEstimate, assumptions }` |
| `ai_metadata` | `jsonb` | NOT NULL | `{ analysisVersion, modelUsed, processingNote }` |
| `low_confidence` | `boolean` | NOT NULL, default `false` | True when OCR < 60% |
| `red_flags_discarded` | `integer` | NOT NULL, default 0 | Hallucination guard count |
| `processing_time_ms` | `integer` | nullable | OCR + AI total time |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

---

### `feature_requests`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `title` | `text` | NOT NULL, max 200 chars | |
| `description` | `text` | NOT NULL, max 2000 chars | |
| `status` | `text` | NOT NULL, default `'open'` | open / planned / in_progress / done / rejected |
| `vote_count` | `integer` | NOT NULL, default 0 | Denormalized for sort perf |
| `submitted_by_fingerprint` | `text` | NOT NULL | |
| `submitted_by_ip` | `inet` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

### `feature_request_votes`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `feature_request_id` | `uuid` | FK → `feature_requests.id`, ON DELETE CASCADE | |
| `fingerprint` | `text` | NOT NULL | |
| `ip_address` | `inet` | NOT NULL | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Unique constraint**: `(feature_request_id, fingerprint)` — one vote per fingerprint per request.

---

### `metadata_roles`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `name` | `text` | UNIQUE, NOT NULL |
| `category` | `text` | NOT NULL (engineering, design, product, marketing, sales, hr, finance, ops, other) |

### `metadata_cities`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `name` | `text` | NOT NULL |
| `state` | `text` | nullable |
| `country` | `text` | NOT NULL, default `'India'` |

**Unique constraint**: `(name, country)`

### `metadata_experience_levels`

| Column | Type | Constraints |
|---|---|---|
| `id` | `serial` | PK |
| `label` | `text` | UNIQUE, NOT NULL |
| `min_years` | `integer` | NOT NULL |
| `max_years` | `integer` | NOT NULL |

**Seed data**: Fresher (0-1), Junior (1-3), Mid (3-5), Senior (5-8), Staff (8-12), Principal (12+)

---

### `analytics_events`

Append-only event log. No updates, no deletes.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| `id` | `uuid` | PK, default `gen_random_uuid()` | |
| `event` | `text` | NOT NULL | Event name |
| `guest_id` | `uuid` | nullable | FK → `guests.id` |
| `properties` | `jsonb` | NOT NULL, default `'{}'` | Event-specific data |
| `ip_address` | `inet` | nullable | |
| `created_at` | `timestamptz` | NOT NULL, default `now()` | |

**Event types**: `offer.uploaded`, `offer.completed`, `offer.failed`, `offer.deleted`, `feature_request.created`, `feature_request.voted`, `guest.rate_limited`, `guest.spoofing_detected`

---

## JSONB Shape Definitions

### User Context (JSONB)

Stored in `offers.user_context`:

```typescript
{
  role?: string;           // "Software Engineer"
  experienceYears?: number; // 3
  city?: string;           // "Bangalore"
  expectedCTC?: number;    // 1500000 (in currency minor unit)
  currency?: string;       // "INR"
}
```

### Extracted Data (JSONB)

Stored in `analyses.extracted_data`. Matches the `extractedData` shape from [ai-prompts.md](file:///c:/Users/Mueen/Desktop/Projects/Personal/Offerlens/offerlens/docs/ai-prompts.md#structured-output-schema).

```typescript
{
  companyName: string | null;
  role: string | null;
  department: string | null;
  joiningDate: string | null;
  location: string | null;
  employmentType: "full-time" | "part-time" | "contract" | "intern";
  compensation: {
    currency: string;       // "INR", "USD"
    baseSalary: { amount: number; period: "monthly" | "annual" };
    variablePay: { amount: number | null; type: string | null; details: string | null } | null;
    equity: { type: string | null; quantity: number | null; vestingSchedule: string | null; strikePrice: number | null; cliffMonths: number | null } | null;
    totalCTC: number | null;
    otherComponents: { name: string; amount: number | null; details: string | null }[];
  };
  noticePeriod: string | null;
  probationPeriod: string | null;
}
```

### Red Flags (JSONB)

Stored in `analyses.red_flags`:

```typescript
[
  {
    type: "non_compete" | "bond" | "vague_compensation" | "missing_benefit" | "clawback" | "ip_assignment" | "probation" | "other";
    severity: "high" | "medium" | "low";
    title: string;          // "2-Year Service Bond"
    explanation: string;    // "You must serve for 2 years or pay ₹2,00,000..."
    matchedText: string;    // Exact text from offer (verified by hallucination guard)
    suggestion: string;     // "Negotiate to reduce bond to 1 year or remove penalty"
  }
]
```

### Salary Comparison (JSONB)

Stored in `analyses.salary_comparison`:

```typescript
{
  marketRange: { p25: number; p50: number; p75: number; p90: number };
  offerPercentile: number | null; // 0-100; null when the letter states no CTC
  roleUsed: string;             // "Software Engineer"
  roleMatchConfidence: number;  // 0.0-1.0
  locationUsed: string;         // "Bangalore, India", or "India (national)" for public_survey
  dataSource: "ai_estimated" | "crowdsourced" | "public_survey";
  disclaimer: string | null;    // "City-level data unavailable..."
  // Optional, set when a real benchmark was used:
  sampleSize?: number;
  benchmarkScope?: "role_city" | "role_experience_national" | "role_national";
  experienceBracket?: string;
}
```

`public_survey` is modelled from the Stack Overflow Developer Survey 2025 (India, ODbL) and is read
from `salary_reference_rows`, a separate table from `salary_submissions`. The two are never pooled.
Each row there holds `source`, `source_version`, `source_row_id`, `licence`, `collected_at`, `role`
(a seed label), `city` (NULL = national), `experience_years`, `ctc` (annual INR), nullable
`company_type` / `company_size`, `weight` and `created_at`; unique on
`(source, source_version, source_row_id)`, indexed on `(source, role, experience_years)`. It has no
user, guest or fingerprint column. Loaded by `npm run db:load-reference`.

In `scoreBreakdown.components`, the salary component may carry
`basis: { source, scope }`. Comparisons rank salary only when two offers share a basis.

### Negotiation Suggestions (JSONB)

Stored in `analyses.negotiation_suggestions`:

```typescript
[
  {
    component: string;     // "Base Salary"
    currentValue: string;  // "₹8,00,000/year"
    suggestedAsk: string;  // "₹10,00,000/year"
    rationale: string;     // "Market median for 3 YOE in Bangalore is ₹10L"
    priority: "high" | "medium" | "low";
  }
]
```

### Benefits (JSONB)

Stored in `analyses.benefits`:

```typescript
[
  {
    name: string;         // "Health Insurance"
    value: string | null; // "₹5,00,000 cover, family floater"
    details: string | null;
    isStandard: boolean;  // true = expected for this role/level
  }
]
```

---

## Index Strategy

| Table | Index | Type | Why |
|---|---|---|---|
| `offers` | `idx_offers_guest_id` | B-tree on `guest_id` | Guest lookup, rate limiting |
| `offers` | `idx_offers_text_hash` | B-tree on `text_hash` | Duplicate detection |
| `offers` | `idx_offers_status` | B-tree on `status` | Worker queue queries |
| `offers` | `idx_offers_expires_at` | B-tree on `expires_at` WHERE `expires_at IS NOT NULL` | Cleanup job (partial index) |
| `offers` | `idx_offers_created_at` | B-tree on `created_at` | Sorting, pagination |
| `analyses` | `idx_analyses_offer_id` | UNIQUE on `offer_id` | Fast join, enforces 1:1 |
| `analyses` | `idx_analyses_score` | B-tree on `score` | Leaderboard/stats queries |
| `guests` | `idx_guests_fingerprint` | UNIQUE on `fingerprint` | Primary lookup |
| `feature_requests` | `idx_fr_vote_count` | B-tree DESC on `vote_count` | "Top voted" sorting |
| `feature_request_votes` | `idx_frv_unique` | UNIQUE on `(feature_request_id, fingerprint)` | Prevent double voting |
| `analytics_events` | `idx_analytics_event` | B-tree on `event` | Event filtering |
| `analytics_events` | `idx_analytics_created` | B-tree on `created_at` | Time-range queries |
| `metadata_cities` | `idx_cities_country` | B-tree on `country` | Filtered dropdowns |

> **Guiding principle**: Index what you query. Phase 1 has ~2K analyses/month — don't over-index. Add composite indexes when real query patterns emerge.

---

## Migration Strategy

Using **Drizzle Kit** for schema-as-code migrations:

```bash
# Generate migration from schema changes
npx drizzle-kit generate

# Apply migrations
npx drizzle-kit migrate

# Push schema directly (dev only)
npx drizzle-kit push
```

**Rules**:
1. Every schema change goes through a migration — no manual SQL in production
2. Migrations are checked into git
3. Destructive changes (drop column, rename) require a 2-step migration: add new → migrate data → drop old
4. `drizzle-kit push` is only for local development rapid iteration

---

## Phase 2/3 Extension Points

| Phase | Table Changes | Notes |
|---|---|---|
| **Phase 2** | Add `users` table, add `user_id` FK to `offers`, `feature_requests`, `analytics_events` | Guest → user migration: update `offers.user_id` where `guest_id` matches fingerprint |
| **Phase 2** | Add `payments` table (pass type, amount, status, expires_at) | Links to `users` |
| **Phase 2** | Add `offer_comparisons` table (set of offer IDs, recommendation) | JSONB for comparison matrix |
| **Phase 3** | Add `salary_submissions` table (anonymized salary data) | The `user_id` column and its FK to users remain but are deprecated and never written (always NULL), as is `fingerprint`; timestamps are coarsened to the UTC day |
| **Phase 3** | Add `forum_posts`, `forum_replies` tables | Standard forum schema |

> No existing tables need structural changes. Phase 2/3 is purely additive — new tables, new FKs on existing tables.
