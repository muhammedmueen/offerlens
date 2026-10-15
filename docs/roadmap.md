# OfferLens Backend — Product Roadmap

## Problem Statement

Job seekers receive offer letters as opaque PDFs with complex compensation structures, hidden red flags, and no benchmark for whether the package is competitive. Most accept or negotiate blindly. **OfferLens solves this** by using AI to decode, score, and benchmark any offer letter in seconds.

## Target Audience

| Persona | Description | Primary Need |
|---|---|---|
| **Job Seeker** (P0) | Professionals evaluating 1+ job offers | Understand if their offer is fair, spot red flags, negotiate confidently |
| **Recruiter / HR** (P1) | Hiring teams crafting competitive offers | Understand how their offers compare to market and why candidates reject |

---

## Implementation Status (verified 2026-09-09)

> [!WARNING]
> **Stale.** This section is a 2026-09-09 snapshot and most of the blockers below have since been fixed. For current status, see [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md): "What Happens Next" and "Implementation Phases" (Phases −1 to 3 done, Phase 4 tasks 4.1–4.4 done as of 2026-10-10).

> This roadmap is the **product intent**. The sections below were written before implementation and describe target behaviour. Where the code diverges, a `> [!NOTE] Status:` callout has been added inline. Nothing else in this document has been rewritten — the specs still stand as the goal.

**Where things actually are**: code exists for every M1-M3 module. Both packages typecheck clean. There is effectively no test suite (one placeholder frontend test; no backend tests; two manual `.mjs` integration scripts). Milestone 4 is untouched.

**Deployment**: never deployed, no real user data. Everything below is a pre-production defect with **zero live exposure** — no audit, remediation, or disclosure obligation. Breaking changes to guest identity, dedup scoping, and API contracts need no backfill. Decisions and rationale are recorded as ADRs in [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md).

**M1 is not shippable yet.** Three launch-blocking defects, detailed with file citations in [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md):

| Blocker | Effect |
|---|---|
| Frontend never sends `X-Fingerprint` | Guest identity collapses to MD5(IP + User-Agent). The 3/day cap is shared across everyone behind a NAT, feature-request votes count networks rather than people, and **signup can migrate a stranger's offers into a new account** |
| Missing ownership checks on offer read/delete/report | Any logged-in user can delete any offer; offer text, analysis, and PDF report are readable by ID with no auth |
| Analysis output is unvalidated | The prompt never contains the schema, `responseSchema` is unset, and there is no Zod validation — malformed AI output is coerced into a confident-looking analysis |
| Salary Explorer is wired to routes that don't exist | `/salaries` vs `/salary`, plus two payload field mismatches. C1 is non-functional end-to-end and the crowdsourced DB can never fill up |

**Also blocking a fresh clone**: `.env.example` omits the required `JWT_SECRET` / `JWT_REFRESH_SECRET`, so copying it fails env validation at boot. The frontend's default API port (5000) doesn't match the backend's (8000), and the backend's default `CORS_ORIGIN` (3000) doesn't match the Vite dev server (8080).

Ownership **is** correctly enforced in the negotiation, benefits, comparison, correction, and career modules. The gap is specific to the offer/analysis routes, not systemic.

---

## MoSCoW Feature Map

### 🔴 MUST — Critical for Launch

| # | Feature | User Story |
|---|---|---|
| M1 | **Offer Upload & OCR** | As a job seeker, I want to upload my offer letter so that the text is automatically extracted |
| M2 | **AI Analysis Pipeline** | As a job seeker, I want AI-powered analysis so that I see red flags, salary comparison, and negotiation tips |
| M3 | **Offer Scoring (0-100)** | As a job seeker, I want a single score so that I can quickly gauge how good my offer is |
| M4 | **Async Processing** | As a job seeker, I want background processing so that I'm not stuck waiting on a loading screen |
| M5 | **Rate Limiting** | As a platform owner, I want abuse prevention so that the service stays reliable |
| M6 | **Metadata APIs** | As a job seeker, I want role/city/experience dropdowns populated from the backend |
| M7 | **Feature Requests** | As a user, I want to submit and vote on feature ideas so that the product evolves based on my needs |
| M8 | **Guest Users** | As a first-time visitor, I want to analyze an offer without signing up so that I can see the value before committing |

#### Access Matrix

| Capability | Phase 1 (Launch — All Free) | Phase 2 (After Traction — Job Hunt Pass) |
|---|---|---|
| Full analysis (score, red flags, salary, tips) | ✅ Free | ✅ Free |
| Negotiation tips (bullet points) | ✅ Free | ✅ Free |
| Benefits overview | ✅ Free | ✅ Free |
| PDF report export | ✅ Free | ✅ **Free forever** |
| Analysis history | ✅ Free (registered) | ✅ Free |
| Feature requests & voting | ✅ Free | ✅ Free |
| Salary crowdsourcing | ✅ Free | ✅ Free |
| Polished negotiation email script | — (not built yet) | 🔒 Pass only |
| Offer comparison (side-by-side) | — (not built yet) | 🔒 Pass only |
| Career path insights (5-year) | — (not built yet) | 🔒 Pass only |
| Full benefits calculator (₹ values) | — (not built yet) | 🔒 Pass only |
| Priority processing (< 10s) | — | 🔒 Pass only |
| Unlimited analyses | ✅ (registered) | 🔒 Pass: unlimited / Free: 5/mo |

> **Principle**: Phase 1 features are free forever. Phase 2 adds new premium features on top — nothing already free moves behind a paywall.

### 🟡 SHOULD — Important, Build Second

| # | Feature | User Story |
|---|---|---|
| S1 | **User Accounts & History** | As a job seeker, I want to save my analyses so that I can revisit them later |
| S2 | **Negotiation Script Generator** | As a job seeker, I want a ready-to-send negotiation email so that I don't have to write one from scratch |
| S3 | **Benefits Calculator** | As a job seeker, I want PTO, insurance, and equity quantified into total comp so that I can compare apples to apples |
| S4 | **PDF Report Export** | As a job seeker, I want to download my analysis as a PDF so that I can share it with mentors or family |
| S5 | **Offer Comparison** | As a job seeker, I want to compare 2-3 offers side-by-side so that I can pick the best one |
| S6 | **RLHF Corrections** | As a user, I want to correct AI mistakes so that future analyses improve |

### 🟢 COULD — Differentiators

| # | Feature | User Story |
|---|---|---|
| C1 | **Salary Crowdsourcing** | As a job seeker, I want to contribute my salary anonymously so that everyone gets better market data |
| C2 | **Career Path Insights** | As a job seeker, I want to see my 5-year trajectory if I accept this role |
| C3 | **Forum** | As a user, I want to discuss salary negotiation strategies with other job seekers |

### ⚪ WON'T (This Version) — Backlog

| # | Feature | Reason |
|---|---|---|
| W1 | Browser Extension | Requires browser-specific development |
| W2 | B2B API Licensing | No demand signal yet; revisit once B2C traction exists |

---

## Milestone Plan

```mermaid
gantt
    title OfferLens Backend Roadmap
    dateFormat  YYYY-MM-DD
    axisFormat  %b %d

    section Stream A: Core Pipeline
    Project scaffolding           :m1a, 2026-02-15, 2d
    Database schema & seed        :m1b, after m1a, 2d
    File upload & storage         :m1c, after m1b, 1d
    OCR (Cloud Vision)            :m1d, after m1c, 2d
    AI analysis (Gemini)          :m1e, after m1d, 3d
    Offer scoring                 :m1f, after m1e, 1d
    Async queue (BullMQ)          :m1g, after m1c, 3d

    section Stream B: CRUD & Metadata
    Health & metadata endpoints   :m1i, after m1a, 1d
    Feature requests CRUD         :m1j, after m1i, 2d

    section Stream C: Cross-Cutting
    Guest user flow & TTL         :m1ga, after m1b, 2d
    Rate limiting & middleware    :m1h, after m1ga, 2d
    Error & empty state handling  :m1hh, after m1h, 1d
    Integration testing           :m1k, after m1f, 3d

    section Milestone 2: User Value
    User auth (JWT + OAuth)       :m2a, after m1k, 3d
    Guest-to-user migration       :m2aa, after m2a, 1d
    Offer history                 :m2b, after m2aa, 2d
    Negotiation script generator  :m2c, after m2b, 2d
    Benefits calculator           :m2d, after m2c, 2d
    PDF report export             :m2e, after m2d, 2d
    Offer comparison              :m2f, after m2e, 3d
    RLHF corrections              :m2g, after m2a, 2d

    section Milestone 3: Intelligence
    Salary crowdsourcing schema   :m3a, after m2f, 2d
    Submission & moderation API   :m3b, after m3a, 3d
    Career path insights          :m3c, after m3b, 3d
    Forum backend                 :m3d, after m3a, 3d

    section Milestone 4: Monetize
    Job Hunt Pass (payments)      :m4a, after m3c, 3d
    Lifetime deal campaign        :m4b, after m4a, 2d
    B2B API licensing (if demand) :m4c, after m4b, 5d
```

---

## Milestone 1: Foundation MVP

> **Goal**: A guest user can upload a PDF on the frontend, receive a complete analysis with a score within 30s, and is rate-limited after 3/day.

### Definition of Done

| # | Criterion | Status |
|---|---|---|
| 1 | Guest uploads a PDF → sees complete analysis on results page within 30s | ⚠️ Works for **text-based PDFs** (extracted client-side via pdf.js). **Scanned PDFs fail** — the Vision fallback calls `textDetection()`, which does not accept PDF input |
| 2 | All 16 frontend API endpoints return valid responses | ⚠️ Endpoints exist; 4 have never been exercised end-to-end (see M2 DoD) |
| 3 | Rate limiting blocks 4th guest upload with upgrade prompt | ⚠️ The 3/day cap is enforced, but keyed on a **shared** identity — it blocks the 4th upload *from that IP+UA*, not from that user |
| 4 | Guest analysis auto-expires after 24h | ✅ Verified. Hourly `cleanup.worker.ts`; `migrateGuestOffers` correctly nulls `expiresAt` so migrated offers survive |
| 5 | All integration tests pass, zero unhandled edge cases | ❌ No test suite exists. Manual scripts only, with known failures |
| 6 | Error states show user-friendly messages (never raw stack traces) | ✅ Central `errorHandler` + `AppError` with typed codes; failure reasons are classified in both workers |

> [!IMPORTANT]
> Criterion 3 is the one to read carefully. Guest rate limiting is not broken in the "limit doesn't apply" sense — it's broken in the "limit applies to the wrong subject" sense, which is also what causes the offer-migration leak. Both trace to the same missing `X-Fingerprint` header.

---

### M1 — Offer Upload & OCR

> As a **Job Seeker**, I want to **upload my offer letter PDF or image**, so that **the system extracts the text automatically**.

**Happy Path**:

> **Given** a user uploads a valid PDF (≤10MB)
> **When** the file is received by `POST /offers`
> **Then** the file is stored, a record is created with status `QUEUED`, and an offer ID is returned

> **Given** a queued offer
> **When** the OCR worker processes it via Google Cloud Vision
> **Then** extracted text is saved to the offer record with a confidence score

**Sad Paths**:

> **Given** a user uploads an unsupported file type (e.g., `.exe`, `.zip`)
> **When** the file is validated
> **Then** a 400 error is returned: `{ code: "INVALID_FILE_TYPE", message: "Please upload a PDF or image (JPG, PNG)" }`

> **Given** a user uploads a corrupt or empty file
> **When** OCR returns no text or errors
> **Then** the offer is marked `FAILED` with: `"We couldn't read this file. Please try a clearer scan or paste the text manually."`

> **Given** OCR extracts text with confidence < 60%
> **When** results are saved
> **Then** the response includes `lowConfidence: true` and the frontend shows a warning: "We had trouble reading parts of your offer. Please review the extracted text and correct any errors."

> **Given** an extremely large image (>20MP)
> **When** the file is received
> **Then** it is resized to max 4096px before sending to Cloud Vision

> [!NOTE]
> **Status: diverges from spec.** The implemented architecture is *hybrid*, not backend-OCR-first: `frontend/src/lib/pdf-extractor.ts` extracts text client-side with pdf.js, and only falls back to `POST /offers/extract-file` (Google Vision) for scanned PDFs and images. Consequences:
>
> - **Scanned PDFs fail.** `google-vision.ocr.ts` uses `textDetection()`, which does not accept PDF input — that needs `asyncBatchAnnotateFiles` with GCS. Images work.
> - **The confidence gate is inert.** `result.fullTextAnnotation?.pages?.[0]?.confidence || 0.85` turns a legitimate `0` into `0.85`. And when it does trip, the offer is **hard-failed** rather than flagged — the spec's `lowConfidence: true` + editable-text warning was not built. `analysis.worker.ts` writes `lowConfidence: false` hardcoded.
> - Image resizing to 4096px is **not implemented**.
> - `POST /offers/extract-file` is **unauthenticated**, so anonymous callers can burn Cloud Vision quota.

---

### M2 — AI Analysis Pipeline

> As a **Job Seeker**, I want to **receive AI-powered analysis of my offer**, so that **I understand red flags, how my salary compares, and what to negotiate**.

**Happy Path**:

> **Given** extracted offer text + user context (role, experience, city, CTC)
> **When** the AI analysis runs via Gemini
> **Then** the response contains: `extractedData`, `redFlags[]`, `salaryComparison`, `negotiationSuggestions[]`, `takeHome`, `offerScore`

> **Given** the AI returns a response
> **When** the response is parsed
> **Then** it strictly matches the expected JSON schema (validated by Zod)

**Quality Thresholds**:

> **Given** OCR confidence < 60%
> **When** the AI analysis runs
> **Then** results include a disclaimer: `"Analysis based on partially readable text — accuracy may be limited"`

> **Given** the role is not in the seeded metadata list
> **When** the AI runs salary comparison
> **Then** it uses the closest AI-matched role, and the response includes `roleMatched: "Software Engineer"` and `roleMatchConfidence: 0.85` so the user knows it's an approximation

> **Given** the city is unrecognized or international
> **When** salary comparison runs
> **Then** the comparison falls back to country-level data with a note: `"City-level data unavailable; using national averages"`

**Sad Paths**:

> **Given** Gemini returns malformed or partial JSON
> **When** Zod validation fails
> **Then** the system retries once with a stricter prompt; if still invalid, marks offer as `FAILED` with: `"Analysis could not be completed. Please try again."`

> **Given** the Gemini API call fails (rate limit, timeout, 5xx)
> **When** the error is caught
> **Then** the offer is retried up to 2 times with exponential backoff; after 3 failures, marked `FAILED` with: `"Our analysis service is temporarily busy. Your offer has been queued and will be processed shortly."`

> **Given** the AI returns a red flag
> **When** the matched text doesn't actually exist in the offer
> **Then** the red flag is discarded (hallucination guard) — only red flags with verified `matchedText` present in the raw text are kept

---

### M3 — Offer Scoring

> As a **Job Seeker**, I want to **see a single 0-100 score for my offer**, so that **I can quickly gauge its quality**.

**Happy Path**:

> **Given** a completed analysis
> **When** the score is calculated
> **Then** it's a weighted composite: salary vs market (40%), red flags penalty (25%), benefits (20%), growth potential (15%)

**Sad Paths**:

> **Given** the AI doesn't return a score
> **When** fallback scoring runs
> **Then** a deterministic score is calculated from available data; the response includes `scoringMethod: "fallback"` so the frontend can show "Estimated score"

> **Given** salary comparison data is unavailable (unrecognized role/city)
> **When** scoring runs
> **Then** the salary weight (40%) is redistributed to other factors, and the score includes a note: `"Score based on limited market data"`

---

### M4 — Async Processing

> As a **Job Seeker**, I want to **not wait on a loading screen**, so that **I can check back when my analysis is ready**.

**Happy Path**:

> **Given** an offer is uploaded
> **When** `POST /offers` returns
> **Then** it responds immediately with `{ id, status: "QUEUED" }` (< 500ms)

> **Given** a queued offer
> **When** the frontend polls `GET /offers/:id`
> **Then** it returns current status (`QUEUED` → `PROCESSING` → `COMPLETED`)

**Sad Paths**:

> **Given** the worker crashes mid-processing
> **When** the job is stale (status = `PROCESSING` for > 5 minutes)
> **Then** a health check marks it as `FAILED` and the user sees: `"Analysis timed out. Please try uploading again."`

> **Given** the Redis queue is down
> **When** `POST /offers` tries to enqueue
> **Then** the system falls back to synchronous processing (slower but functional) and logs an alert

---

### M5 — Rate Limiting

> As a **Platform Owner**, I want to **prevent API abuse**, so that **the service stays available for legitimate users**.

**Happy Path**:

> **Given** a guest user
> **When** they exceed 3 offer uploads per day
> **Then** a 429 response is returned with `{ code: "RATE_LIMITED", message: "Create a free account for unlimited analyses", upgradeUrl: "/signup" }`

> **Given** any user
> **When** they exceed 30 API requests per minute
> **Then** a 429 response is returned with `Retry-After` header

**Sad Path**:

> **Given** a user spoofs the `X-Fingerprint` header to bypass limits
> **When** the same IP is seen with 5+ distinct fingerprints in 1 hour
> **Then** rate limiting falls back to IP-only mode for that IP, and the incident is logged

> [!WARNING]
> **Update (fix-rate-limiter): the limiter now works.** `registerRateLimiter` was not wrapped in `fastify-plugin`, so none of these limits ever reached a real route; 9 of the per-route limits plus the global one are now enforced and verified live (see the "Rate limiter fix" outcome in `PLAN-analysis-pipeline.md` and the table in `api-spec.md`). Bullets below describe the state before that fix, except the spoofing, `spoofingTracker` and TOCTOU ones which this fix did not touch.
>
> **Original status: mostly unimplemented.** `config/constants.ts` defines 15 per-route limits in `RATE_LIMITS`. `middleware/rate-limiter.ts` registers exactly **one** — `global` at 100/min. Only `guestUpload` is separately enforced, inside `GuestService.checkLimits`.
>
> - The "30 API requests per minute" happy path is actually **100/min**, and no `Retry-After` header is set.
> - `authLogin: { max: 10, window: '15 minutes' }` was **dead config** (now enforced) — login brute-force protection is whatever the global limit allows.
> - The spoofing detector **can never fire**, because the frontend never sends `X-Fingerprint`, so exactly one fingerprint is ever seen per IP.
> - `spoofingTracker` is an unbounded in-memory `Map`, so it is single-instance only and leaks across many distinct IPs.
> - `checkLimits` / `incrementAnalysisCount` is a TOCTOU race — concurrent uploads can both clear the check.

---

### M6 & M7 — Metadata & Feature Requests

See [implementation_plan.md](file:///C:/Users/Mueen/.gemini/antigravity/brain/42766cda-5c2b-4561-8a05-c7e308845b71/implementation_plan.md) for endpoint specifications.

**Sad Path (Feature Requests)**:

> **Given** a user submits a feature request with profanity or spam
> **When** the request is validated
> **Then** basic keyword filtering rejects it with 400: `"Submission rejected — please rephrase"`

> [!NOTE]
> **Status: not implemented.** There is no profanity or spam filtering anywhere in the codebase. The same applies to the forum sad path in C3 and the salary moderation in C1. `rejected` exists only as a status enum value and is never set by a content check.

---

### M8 — Guest Users

> As a **First-Time Visitor**, I want to **analyze an offer without creating an account**, so that **I can experience the product's value before signing up**.

**Happy Path**:

> **Given** a visitor with no account
> **When** they upload an offer via `POST /offers`
> **Then** the analysis runs normally, but the offer record is marked `guest: true` with an `expiresAt` timestamp (24 hours from creation)

> **Given** a guest's analysis is complete
> **When** they view the results page
> **Then** they see the full analysis but with a banner: "Sign up to save this analysis and unlock comparison, exports, and negotiation scripts"

> **Given** a guest user who later signs up
> **When** they create an account within the 24-hour TTL window
> **Then** their existing guest analyses (matched by fingerprint) are migrated to their new account and the TTL is removed

**Sad Paths**:

> **Given** a guest user
> **When** they try to access history, PDF export, or offer comparison
> **Then** they receive a 403 with `{ code: "GUEST_RESTRICTED", message: "Create a free account to access this feature" }`

> **Given** a guest user
> **When** they exceed 3 analyses per day
> **Then** a 429 response is returned with message "Create a free account for unlimited analyses"

> **Given** a guest clears cookies and uses a VPN (fingerprint + IP reset)
> **When** they appear as a "new" guest
> **Then** they get 3 more analyses (accepted trade-off — the cost of each analysis is low, and aggressive blocking risks penalizing legitimate users)

> **Given** a guest signs up after the 24h TTL has expired
> **When** account is created
> **Then** the expired analyses are already purged; the user starts fresh (no migration possible)

**Implementation Notes**:
- Guest identity tracked via `X-Fingerprint` header (client-side generated) + IP address
- Offer records store `guestFingerprint` and `expiresAt` fields
- A scheduled BullMQ repeatable job purges expired guest records daily
- Guest analyses are **read-only** — no corrections, no re-analysis

> [!CAUTION]
> **Status: the identity mechanism this milestone depends on was never wired up.** The frontend sends no `X-Fingerprint` header — zero occurrences in all of `frontend/src`. `middleware/guest-identifier.ts` therefore always uses its fallback, `MD5(ip + userAgent)`, so **every visitor sharing an IP and User-Agent is the same guest**.
>
> Two live consequences:
>
> 1. **Shared quota** — an office or campus network gets 3 analyses total, not 3 each.
> 2. **Cross-user data leak** — `AuthService.migrateGuestOffers(fingerprint, userId)` matches on that fingerprint, so **signup can migrate a stranger's offer letters** (salary, company, name) into a new account. This sits in the primary conversion funnel.
> 3. **Feature-request voting counts networks, not people** — `feature-request.routes.ts` uses `req.guestId` as the vote dedup key, so the second person behind a NAT cannot vote. This undercuts M7's stated purpose of letting the product evolve on user demand.
>
> Separately, the guest **read** path has no authorization at all: `GET /offers/:id` (returns `rawText`), `GET /offers/:id/analysis`, and `GET /offers/:id/report` are readable by anyone holding the ID. The report endpoint was specified above as `GUEST_RESTRICTED`; it is fully open. And because `offers.textHash` is globally `.unique()`, uploading identical text returns *another user's* offer ID, which those open endpoints will then serve.
>
> Fixing this needs a decision, not just a patch: a real client fingerprint, or a signed guest cookie / guest-scoped token. See "Decisions Needed" in [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md).
>
> ✅ What does work: the 24h TTL purge. `cleanup.worker.ts` runs hourly and `migrateGuestOffers` nulls `expiresAt`, so migrated offers are not purged.

---

### Error & Empty State UX Specs

| Scenario | What the User Sees |
|---|---|
| **First visit, no analyses** | Upload page with hero text: "Upload your first offer letter to get started" — no empty table |
| **Analysis failed (3 retries exhausted)** | Results page shows: "We couldn't analyze this offer. [Try Again] or [Paste Text Manually]" |
| **OCR extracted gibberish** | Warning banner + editable text area: "We had trouble reading your offer. Please review and correct the text below." |
| **All 3 guest analyses used** | Upload page shows: "You've used all 3 free analyses today. [Create Free Account] for unlimited access" — upload button disabled |
| **Network error mid-poll** | Toast: "Connection lost. We'll keep trying…" with auto-retry every 5s |
| **Offer still processing after 60s** | Progress indicator changes to: "Taking longer than usual. We'll notify you when ready." |

---

## Milestone 2: User Value

### Definition of Done

| # | Criterion | Status |
|---|---|---|
| 1 | Users can sign up (email + Google OAuth), log in, and see their analysis history | ✅ Implemented and exercised by `test-m2.mjs`. ⚠️ Refresh tokens are stored in `localStorage`, against this project's own stated standard of httpOnly cookies |
| 2 | Guest analyses migrate to new accounts on signup | ⚠️ Mechanically works, but matches on the collapsed fingerprint — **can migrate another person's offers**. See M8 status note |
| 3 | Registered users can generate negotiation scripts, calculate benefits, export PDFs, and compare offers | ❌ **Never verified end-to-end.** In `test-m2-results.txt` negotiation, benefits, and corrections all returned `OFFER_NOT_READY` and comparison was skipped, because no analysis reached `COMPLETED` during that run. Ownership checks in these modules are correct; the feature paths themselves are untested |
| 4 | RLHF corrections are saved and logged | ⚠️ Code is complete with ownership checks. Untested for the same reason as 3 |

---

### S1 — User Accounts & History

> As a **Job Seeker**, I want to **create an account and see my past analyses**, so that **I can revisit and compare offers over time**.

**Happy Path**:

> **Given** a new user
> **When** they sign up via email or Google OAuth
> **Then** an account is created, JWT issued, and they are redirected to dashboard

> **Given** a logged-in user
> **When** they visit their dashboard
> **Then** they see a list of all past offers with status, score, and date

> **Given** a guest who already analyzed offers
> **When** they sign up
> **Then** previous guest analyses (matched by fingerprint) are migrated to their account and persisted permanently

**Sad Path**:

> **Given** a user tries to sign up with an email already in use
> **When** the form is submitted
> **Then** a 409 is returned: `"An account with this email already exists. Did you mean to log in?"`

---

### S2 — Negotiation Script Generator

> As a **Job Seeker**, I want to **get a ready-to-send negotiation email**, so that **I can negotiate confidently without writing from scratch**.

**Happy Path**:

> **Given** a completed analysis with negotiation suggestions
> **When** the user requests a script via `POST /offers/:id/negotiate`
> **Then** Gemini generates a professional email script with: subject line, greeting, 3-4 negotiation points with justification, professional closing

**Sad Paths**:

> **Given** the offer data is too vague (e.g., no salary, no company name extracted)
> **When** the user requests a negotiation script
> **Then** the response includes a generic template with placeholders: "[COMPANY NAME]", "[YOUR TARGET SALARY]" and a note: "We couldn't extract enough detail for a fully personalized script. Please fill in the bracketed fields."

> **Given** a guest user requests a negotiation script
> **When** the endpoint checks auth
> **Then** 403: `{ code: "GUEST_RESTRICTED" }`

---

### S3 — Benefits Calculator

> As a **Job Seeker**, I want **PTO, insurance, equity, and perks quantified in monetary terms**, so that **I can compare total compensation across offers**.

**Happy Path**:

> **Given** extracted offer data with benefits (PTO days, insurance, equity/RSUs)
> **When** the calculator runs
> **Then** each benefit is assigned a monetary value and summed into `totalCompensation`

**Sad Paths**:

> **Given** no benefits info was extracted from the offer
> **When** the calculator runs
> **Then** the response returns `totalCompensation: null` with `message: "No benefits data found in your offer. Your total comp equals your base CTC."` — the benefits section shows an empty state prompting the user to add benefits manually

> **Given** equity is mentioned but without a vesting schedule or strike price
> **When** the calculator runs
> **Then** equity is shown as "Mentioned but not quantifiable" and excluded from the monetary total

---

### S4 — PDF Report Export

> As a **Job Seeker**, I want to **download my analysis as a PDF**, so that **I can share it offline**.

**Happy Path**:

> **Given** a completed analysis
> **When** the user requests `GET /offers/:id/report`
> **Then** a styled PDF is generated with: offer summary, score, red flags, salary comparison, negotiation tips

**Sad Path**:

> **Given** PDF generation fails (rendering library error)
> **When** the error is caught
> **Then** 500: `"Report generation failed. Please try again."` — with fallback option to copy analysis as plain text

---

### S5 — Offer Comparison

> As a **Job Seeker**, I want to **compare 2-3 offers side-by-side**, so that **I can make the best decision**.

**Happy Path**:

> **Given** 2-3 completed analyses
> **When** the user requests `POST /offers/compare` with offer IDs
> **Then** the response includes a comparison matrix with: scores, salary, benefits, red flag count, and a recommendation

**Sad Paths**:

> **Given** one of the selected offers is still `PROCESSING` or `FAILED`
> **When** the comparison is requested
> **Then** 400: `"Offer [id] is not ready for comparison. Status: PROCESSING"` — the frontend disables that offer in the selector

> **Given** a user tries to compare only 1 offer
> **When** the request is validated
> **Then** 400: `"Comparison requires at least 2 offers"`

> **Given** a guest user
> **When** they request comparison
> **Then** 403: `{ code: "GUEST_RESTRICTED" }` — guests must create a free account first

---

### S6 — RLHF Corrections

**Sad Path**:

> **Given** a user submits corrections that are identical to existing data
> **When** the patch is applied
> **Then** the response returns 200 with `{ changed: false }` — no re-analysis is triggered

---

## Milestone 3: Market Intelligence

### Definition of Done

| # | Criterion | Status |
|---|---|---|
| 1 | Anonymous salary submissions work with moderation (spam/troll filtering) | 🔴 **Submission is broken from the UI** — path and payload both mismatch the backend (see C1 note). Server-side numeric sanity checks are sound (`SalaryService.validate` rejects <₹1L with >5 YOE, >40 YOE, >₹20Cr) and a 1-per-hour-per-fingerprint check exists. ❌ **No spam/profanity filtering anywhere in the codebase** — `rejected` is only a status enum value, never set by a content filter. No 3σ outlier rejection, no recency weighting |
| 2 | Salary comparison uses crowdsourced data when 50+ data points exist for a role+city combo | 🔴 **Unreachable.** `SalaryService.getStats()` is never called by the analysis worker, so offer analysis is 100% AI-fabricated. The Salary Explorer page *would* call it, at a threshold of `n < 5` rather than 50 — but its request 404s, and submissions can't land either, so the data set stays empty by construction |
| 3 | Career path insights generate meaningful 5-year trajectories | ⚠️ Endpoint works (`test-m3.mjs` passes) but is called with hardcoded `industry: 'Technology'` / `companyType: 'Unknown'`, so output is generic |
| 4 | Forum supports posting, replying, and viewing with pagination | ✅ Verified by `test-m3.mjs` — create, list by category, detail, and comment all pass. ❌ No content moderation (see 1) |

---

### C1 — Salary Crowdsourcing

> As a **Job Seeker**, I want to **anonymously share my salary**, so that **the community gets better market data**.

**Happy Path**:

> **Given** a user submits salary data (role, experience, city, CTC, company size)
> **When** the submission is saved
> **Then** it is stored anonymously (no PII linkage) and contributes to aggregate market statistics

> **Given** 50+ data points for a role+city combination
> **When** a user analyzes an offer for that combination
> **Then** the salary comparison uses real crowdsourced data instead of AI estimates, with source label: `"Based on 127 verified submissions"` *(historical example; the shipped label is "Based on N crowdsourced, unverified submissions ... Some may be offered, not current, pay", see task 5.4 in PLAN-analysis-pipeline.md)*

**Sad Paths & Moderation**:

> **Given** a submission with obviously fake data (e.g., ₹1 CTC, 500 years experience)
> **When** validation runs
> **Then** the submission is rejected with 400: `"The values provided appear invalid. Please double-check your entry."`

> **Given** a burst of 10+ submissions from the same IP in 1 hour
> **When** rate limiting is checked
> **Then** further submissions are blocked: `"Too many submissions. Please try again later."`

> **Given** fewer than 50 data points exist for a role+city combination
> **When** salary comparison runs
> **Then** AI-estimated ranges are used with a label: `"Estimated — not enough submissions yet. [Contribute your salary] to improve accuracy."`

**Data Retention**: Submissions are retained indefinitely but fully anonymized — no linkage to user accounts, IPs, or fingerprints after validation.

> [!CAUTION]
> **Status: this feature is non-functional end-to-end, and the anonymity guarantee is not implemented.**
>
> **The UI cannot submit or read salary data at all.** Three independent frontend↔backend mismatches:
>
> | Layer | Frontend sends | Backend expects | Result |
> |---|---|---|---|
> | Path | `POST /salaries`, `GET /salaries/stats` | `POST /salary`, `GET /salary` | **404** (historical: the route is `POST /salaries`) |
> | Field | `annualCtc` | `ctc` | NOT NULL violation |
> | Field | *(omitted)* | `companyType` (`.notNull()`) | NOT NULL violation |
>
> So the crowdsourced DB has no way to fill up, which means the "50+ data points" happy path below can never trigger regardless of traffic.
>
> **The anonymity guarantee is false.** `salary_submissions` has a `user_id` column that is a **live foreign key to `users.id`**, plus a `fingerprint` column. Both are written on submit and never scrubbed. "No PII linkage" and "fully anonymized after validation" do not hold.
>
> Also on this section:
> - *(Historical, obsolete.)* The **50-data-point threshold does not exist**. `SalaryService.getStats()` uses `data.length < 5`, and the analysis worker never calls it, so crowdsourced data never reaches an offer analysis regardless of volume.
> - *(Historical, obsolete.)* The **burst-rate spec is inverted in practice.** Implementation is 1 submission per hour per *fingerprint*, not 10 per IP. Stricter on paper — but since fingerprints collapse to IP+UA, it means **one person per network per hour** can contribute. Identity is now the guest cookie with a Redis cooldown (task 4.6), and the minimum sample is 10 (task 5.3).
> - Numeric sanity checks work: `<₹1L with >5 YOE`, `>40 YOE`, `>₹20Cr` are rejected. No 3σ outlier rejection or recency weighting (Phase 4, task 24) *(both shipped in task 5.3)*.

---

### C2 — Career Path Insights

> As a **Job Seeker**, I want to see **where this role could lead in 5 years**, so that **I can evaluate long-term value, not just current salary**.

**Happy Path**:

> **Given** a completed offer analysis
> **When** the user requests career insights
> **Then** Gemini generates a 5-year trajectory: typical promotions, salary progression, and skill development for the role+industry

**Sad Paths**:

> **Given** the role is highly niche or unrecognized
> **When** career insights are requested
> **Then** the response includes a generic trajectory for the broader field with a note: `"We don't have specific data for [Niche Role]. Showing trajectory for the broader [Industry] field."`

> **Given** the offer is for a location with very different career norms (e.g., government vs private sector)
> **When** insights are generated
> **Then** the response accounts for sector context in the trajectory

---

### C3 — Forum

**Sad Paths**:

> **Given** a user posts content with profanity or spam links
> **When** the post is validated
> **Then** it is rejected with 400: `"Your post was flagged for review. Please rephrase and try again."`

> **Given** the forum has zero posts
> **When** a user visits the forum page
> **Then** they see an empty state: "Be the first to start a discussion! Share your negotiation experience."

---

## Milestone 4: Monetization (Phase 2 — After Traction)

> **Launch only after hitting traction signals**: 2,000+ monthly analyses, 1,000+ registered users, 30%+ returning users.

### Definition of Done
- [ ] Job Hunt Pass purchase flow works end-to-end (Razorpay/Stripe)
- [ ] New premium features (scripts, comparison, career insights, priority) are gated to pass holders
- [ ] All Phase 1 features remain completely free — no existing feature moves behind a paywall
- [ ] Pass expiry downgrades gracefully (analyses and PDFs remain accessible)

---

### Job Hunt Pass

- **30-day Pass** (₹999): Unlimited analyses, polished negotiation scripts, offer comparison, career insights, full benefits calculator, priority processing
- **90-day Pass** (₹1,999): Everything in 30-day + counter-offer scripts
- **Lifetime Deal** (₹3,999): Everything, forever. Capped at 500 users.

See [monetization.md](file:///C:/Users/Mueen/.gemini/antigravity/brain/42766cda-5c2b-4561-8a05-c7e308845b71/monetization.md) for full pricing strategy, conversion triggers, and revenue projections.

**Sad Paths**:

> **Given** a free user hits their monthly 5-analysis limit (Phase 2 only)
> **When** they try to upload a 6th offer
> **Then** a soft prompt: "You've used your 5 free analyses this month. Actively hunting? Unlock unlimited with a Job Hunt Pass →" — upload is blocked but UI remains friendly

> **Given** a user's Job Hunt Pass expires
> **When** they try to use pass features (scripts, comparison)
> **Then** they are downgraded to free tier; all existing analyses, history, and PDFs remain accessible forever

---

## Privacy & Compliance

> [!CAUTION]
> **Status: two of these policies are not true of the current code.** These are user-facing promises, so they need either an implementation or a wording change before a privacy policy ships publicly.
>
> | Policy | Reality |
> |---|---|
> | "Uploaded PDFs deleted from storage after OCR extraction" | ❌ **False.** Nothing deletes a file post-extraction. Files are removed only on guest TTL expiry or explicit `DELETE /offers/:id`. Since `expiresAt` is null for registered users, **their uploads persist indefinitely** |
> | "Users can request a full data export (`GET /account/export`)" | ❌ **Not implemented.** No such route exists |
> | "Right to delete" | ✅ `DELETE /users/me` and `DELETE /offers/:id` both work and clean up stored files. Note the paths differ from the `/account` ones named below |
> | "Guest data auto-purged after 24h" | ✅ Verified working |
> | "Salary crowdsourcing fully anonymized" | ⚠️ `salarySubmissions` retains `userId` and `fingerprint` columns and they are written on submit. The stated policy is "no linkage after validation passes" — no scrubbing step exists |
> | Raw offer text retention | ⚠️ Retained indefinitely. The 90-day retention + PII redaction policy is Phase 4 task 27 in [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md), not built |

| Concern | Policy |
|---|---|
| **Uploaded PDFs** | Deleted from storage after OCR extraction. Only extracted text is retained. |
| **Extracted text sent to Gemini** | Gemini API does not use customer data for model training ([Google policy](https://ai.google.dev/terms)). This is disclosed in the privacy policy. |
| **Right to delete** | `DELETE /offers/:id` permanently deletes the offer, analysis, and any associated files. `DELETE /account` deletes all user data. |
| **Guest data** | Auto-purged after 24h TTL. No PII is stored for guests. |
| **Salary crowdsourcing** | Fully anonymized at submission time — no linkage to user account, IP, or fingerprint after validation passes. |
| **Data retention** | Registered user data retained until account deletion. Anonymized aggregate data (salary stats) retained indefinitely. |
| **GDPR** | Users can request a full data export (`GET /account/export`) or deletion (`DELETE /account`). |

---

## Architecture Overview

> [!NOTE]
> **Status: diagram corrected to match the code.** The frontend is a **Vite + React SPA** (react-router), not Next.js — so there is no SSR and the rendering-strategy assumptions that come with Next.js do not apply. Text extraction also happens client-side in the browser before upload, which the original diagram did not show.

```mermaid
flowchart TB
    subgraph Frontend
        A["Vite + React SPA<br/>(react-router)"]
        A2["pdf.js<br/>client-side text extraction"]
        A --> A2
    end

    subgraph Backend
        B[Fastify API Server]
        C[BullMQ Worker]
        D[Guest Cleanup Job]
    end

    subgraph Data
        E[(PostgreSQL)]
        F[(Redis)]
        G[Local/S3 Storage]
    end

    subgraph External
        H[Google Cloud Vision]
        I[Gemini AI]
    end

    A -->|REST API| B
    A2 -->|"text (happy path)"| B
    A2 -->|"scanned/image fallback"| B
    B --> E
    B --> F
    B --> G
    B -->|Enqueue| F
    C -->|Dequeue| F
    C -.->|"mostly bypassed —<br/>text arrives pre-extracted"| H
    C --> I
    C --> E
    D -->|Hourly cleanup| E
    D -->|Delete expired files| G
```

> [!NOTE]
> Because the browser pre-extracts text, the backend OCR worker's Cloud Vision branch is bypassed on the happy path — shown dotted above. Files are stored but **only deleted on guest expiry or explicit offer deletion**; see the Privacy note below.

---

## Success Metrics

> [!NOTE]
> **Non-functional targets are now set** — see ADR-002 in [PLAN-analysis-pipeline.md](./PLAN-analysis-pipeline.md). The flat "< 30s" below is superseded: it was unachievable as a p99 once the pipeline gains a second AI round-trip.
>
> | Target | Value |
> |---|---|
> | Sync API p99 | 400 ms |
> | Analysis end-to-end | p50 20s / p95 45s / p99 90s |
> | SLO | 99.5% monthly on sync API; analysis measured on success rate |
> | Error-budget owner | Project owner |
> | RPO / RTO | 24 h / 4 h |
> | Frontend LCP | 2500 ms mobile-4G p75 |
> | Frontend bundle | 200 KB init + 80 KB/route gzip — ✅ **met: 177.6 KB gzip initial**, was a 1,465 KB single chunk. Fixed in `-1C` by route-level `React.lazy` plus an on-demand `pdfjs-dist` import |

| Metric | Target (M1) | Target (M2) | Target (M4) |
|---|---|---|---|
| Upload → results latency | < 30s *(superseded — see above)* | < 25s | < 15s |
| Analysis accuracy (correction rate) | < 30% | < 20% | < 10% |
| Uptime | 99% | 99.5% | 99.9% |
| Daily active analyses | 10+ | 50+ | 500+ |
| Guest → registered conversion | — | 15% | 25% |
| Premium conversion | — | — | 5% of registered |

---

## Risk Register

### 🔴 Realized — these are no longer risks, they are current defects

| Was logged as | What actually happened | Action |
|---|---|---|
| **Guest fingerprint spoofing** — "Low likelihood, mitigated by IP fallback" | Inverted. Nobody needs to spoof: the header is never sent, so **everyone** already shares one identity. The IP-fallback mitigation *is* the failure mode, and the 5-fingerprint detector can never fire. ✅ **Resolved by ADR-001** — signed httpOnly cookie replaces fingerprinting entirely and deletes the detector as dead code | Phase -1a |
| **AI hallucination** — "mitigated by hallucination guard" | The red-flag guard works, but it was the *narrow* case. Salary benchmarks (`p25/p50/p75/p90`) are fabricated wholesale with no guard, and the prompt never contains the schema | Phase 1 |
| **GCP cost overrun** — "mitigated by rate limiting" | Per-route rate limiting was never registered (fixed in fix-rate-limiter: extract is now 20/hour and extract-file 10/hour per caller). `POST /offers/extract` (Gemini) and `/extract-file` (Vision) are unauthenticated behind a single 100/min global limit. **Root cause found**: v1 commit `ab9702f` disabled these deliberately — *"to allow unrestricted access during development/testing"* — and they were never restored. No incident, so re-enabling is safe | Phase -1e, -1f |
| **Cloud Vision OCR accuracy** — "mitigated by showing confidence score" | The confidence score never reaches the UI: `\|\| 0.85` masks a real `0`, low confidence hard-fails instead of warning, and `lowConfidence` is hardcoded `false` | Phase 3, 21d |
| **Low crowdsourced salary data** — "mitigated by AI fallback with source label" | Moot — the crowdsourced path is never consulted during analysis at all, so it is *always* the AI fallback, and the `dataSource` label is not surfaced | Phase 1 |

### 🟡 Newly identified

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **No test suite** | Any refactor silently breaks behaviour; the pipeline rewrite is unverifiable | High | Phase 0 eval corpus + field-level accuracy harness, before Phase 1 |
| **Frontend↔backend contract drift** | Already realized once (Salary Explorer, 404 + 2 field mismatches) and there is a second latent case (`OFFER_ANALYZE` points at a nonexistent route). Nothing detects it | High | One contract test asserting every `ENDPOINTS` entry resolves to a registered route |
| **Stale verification artifacts** | `test-m3-results.txt` records `/salaries` → 200 against routes that no longer exist, so a passing-looking log masks a broken feature | High | Version the integration scripts, or replace them with real tests |
| **Divergent enum vocabularies** | Experience level is defined three ways (frontend hardcodes 8 values, DB seed and Gemini prompt use a different 6). AI-extracted values won't match the dropdown | Medium | Single source of truth = DB seed; bind the form to `GET /metadata/experience-levels` |
| **Local setup can't work from `.env.example`** | New contributors hit a boot failure; three config values need manual overrides | Medium | Fix `.env.example`, align port and CORS defaults, add `frontend/.env.example` |
| **`frontend/.env` is committed** | No `.env.example` counterpart, and the pattern is inverted — harmless today (OAuth client IDs are public by design) but the wrong habit for the file that will hold secrets later | Low | Gitignore it, add `frontend/.env.example` |
| **Privacy policy overstates deletion** | Compliance exposure — the doc promises post-OCR file deletion and a data-export endpoint, neither of which exist | Medium | Implement, or correct the wording before publishing a policy |
| **Salary submissions are not anonymous** | Contradicts a stated privacy guarantee; `userId` is a live FK to `users.id` | Medium | Add a scrubbing step post-validation, or restate the policy |
| **Phantom dependency** — `uuid` imported but undeclared | Build breaks if `bullmq` drops it or hoisting changes | Low | Declare it, or use `crypto.randomUUID()` |
| **Stuck offers never recover** | `PROCESSING` is terminal on worker crash; `ANALYSIS_TIMEOUT_MS` is defined but unreferenced | Medium | Phase 3, 21a |
| **pdf.js worker loaded from public CDN** | Third-party runtime dependency on the critical upload path; supply-chain and availability exposure | Medium | Self-host the worker (`vite-plugin-static-copy` is already installed but unused) |
| **Refresh tokens in `localStorage`** | XSS-exfiltratable, 7-day lifetime | Medium | Move to httpOnly cookies per the project's own standard |

### ⚪ Still open as written

| Risk | Impact | Likelihood | Mitigation |
|---|---|---|---|
| **Gemini API rate limits** | Analysis delays | Medium | ✅ Partly handled — `withFallback()` walks 6 models on 429. Queue retries exist. "Cached market data" fallback does not |
| **Vendor lock-in** — heavy reliance on GCP | Expensive migration | Low | ✅ Holding up. `AiProvider` / `OcrProvider` / storage interfaces with mock implementations are in place |
| **Offer format diversity** — Indian vs US vs EU structures | AI misinterprets locale-specific terms | High | Locale-aware prompts; detect currency/format; test with diverse sample offers — **not started**, and Phase 0's corpus is the prerequisite |
| **Guest abuse** (no auth) | Resource drain | Medium | 3/day cap and 24h TTL work; the identity they key on does not (see Realized) |
| **Storage bloat from expired guest files** | Disk/S3 costs | Low | ✅ Hourly cleanup job verified working. Note registered users' files are never purged |
| **Scope creep** — 11+ user-selected features | Delays MVP launch | High | ⚠️ Partly realized: M1-M3 code all landed before M1 was verified shippable, which is how these defects accumulated unnoticed |
