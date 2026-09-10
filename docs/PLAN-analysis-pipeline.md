# PLAN: Reliable Analysis Pipeline (All Features)

> **Problem**: The system sends raw offer text to Gemini AI in a single-pass with a vague prompt and blindly trusts the response. Salary data is fabricated, red flags may be hallucinated, scores are arbitrary. Downstream features (negotiation, comparison, career) inherit these problems.

---

## Verified State (2026-09-09)

This section records what was confirmed by reading and running the code, not inferred from planning docs.

| Check | Result |
|-------|--------|
| `backend`: `tsc --noEmit` | ✅ passes clean |
| `frontend`: `tsc --noEmit -p tsconfig.app.json` | ✅ passes clean |
| `frontend`: `npm test` | ✅ 1 passed — but the only test is `expect(true).toBe(true)` |
| `backend`: automated tests | ❌ none exist |
| Integration verification | Manual scripts only: `test-m2.mjs`, `test-m3.mjs` |
| Pipeline refactor progress | ❌ not started — worker still single-pass |
| Working tree | clean, `main` synced with origin |

**Manual test script status**: `test-m2-results.txt` shows negotiation, benefits, and corrections all returning `OFFER_NOT_READY`, and comparison skipped, because no analysis reached `COMPLETED` during that run. Those four features have never been exercised end-to-end. `test-m3-results.txt` shows salary stats returning "not enough data" at n=2.

**Already implemented from this plan**: the red-flag hallucination guard is live in `analysis.worker.ts` — flags whose `matchedText` is absent from the raw text are discarded and counted in `redFlagsDiscarded`. Nothing else below has been started.

---

## Current System Audit

### Core Analysis Pipeline

```mermaid
graph LR
    TEXT["Offer Text"] -->|"single vague prompt"| AI["Gemini AI"]
    AI -->|"raw JSON, no validation"| NORM["Normalize"]
    NORM -->|"save blindly"| DB["DB"]
    
    style AI fill:#ff6b6b,stroke:#333
```

| Problem | Where | Impact |
|---------|-------|--------|
| Prompt never contains the schema | `gemini.ai.ts` → `buildPrompt()` ends with "Output compliant JSON matching the AnalysisResult interface." The interface is never included in the prompt text | The model is asked to conform to a TypeScript type it has never seen |
| `responseSchema` not set | `gemini.ai.ts` sets `responseMimeType: 'application/json'` only | The sole structural guarantee is "it is JSON" |
| No validation of AI output | `normalizeAiResult()` in `analysis.worker.ts` coerces whatever arrives into shape with defaults. No Zod anywhere on the response path | A garbage response becomes a confident-looking analysis |
| No retry on malformed JSON | `JSON.parse` failure is not a rate-limit error, so `withFallback()` rethrows immediately | Contradicts roadmap's "retry once with a stricter prompt" |
| Salary data hallucinated | `salaryComparison` always `ai_estimated` | Users make career decisions on fabricated numbers |
| Crowdsourced salary DB exists but is never used | `SalaryService.getStats()` is functional, never called by the worker. Threshold is `data.length < 5`, not 10 | Real data wasted |
| Score formula is trivial | `70 base ± flags ± percentile`, `analysis.worker.ts` | Doesn't reflect actual offer quality |
| Red flag detection is AI-only | No rules engine | Misses obvious flags, invents others |
| No confidence signals | `lowConfidence` is hardcoded `false` when the analysis row is inserted | Users can't tell what's reliable vs guessed |
| Author's scratch reasoning left in source | ~25 lines of unresolved stream-of-consciousness comments above the scoring block in `analysis.worker.ts` | Obscures intent for the next reader |
| `processingTimeMs` is wrong | Computed as `Date.now() - offer.updatedAt`, which is not job start time | Metric is meaningless |

### Feature-Level Problems

| Feature | Current Approach | Problem |
|---------|-----------------|---------|
| **Salary Comparison** | AI fabricates `p25/p50/p75/p90` from training data | 100% hallucinated. `SalaryService` with crowdsourced data exists but is never connected |
| **Negotiation Script** | Feeds AI-hallucinated `salaryComparison` into negotiation prompt | Garbage-in-garbage-out — negotiation points based on fake market data |
| **Benefits Valuation** | ⚠️ **Corrected assessment.** `benefits.calculator.ts` structures benefits and does PTO × daily-rate math, but `extractNumber()` strips currency symbols and takes the first number with **no unit handling** | "₹5 lakh" → `5`. "₹2.5L" → `2.5`. "10 LPA" → `10`. Monetary values can be wrong by 5-6 orders of magnitude, and they feed `totalCompensation`. Also grabs the low end of ranges ("18-24 days" → `18`) |
| **Offer Comparison** | Deterministic ranking by score/flags/percentile | Good structure, but all inputs (score, percentile) are AI-fabricated |
| **Career Path** | Calls `ai.generateCareerPath()` with hardcoded `industry: 'Technology'`, `companyType: 'Unknown'` | No real context. Completely generic AI generation |
| **Take-Home Estimate** | AI guesses monthly take-home with "assumptions" | Should be deterministic tax math, not AI speculation |

---

## Defects Outside the Pipeline

> This plan was originally scoped to AI accuracy only. A code-level pass surfaced a separate class of defect — authorization, guest identity, rate limiting, and dead code paths — that blocks launch independently of pipeline quality. These are **not** fixed by the multi-stage refactor and need their own phase.

### 🔴 P0 — Guest identity collapses across users

**The frontend never sends `X-Fingerprint`.** Zero occurrences in all of `frontend/src`. So `middleware/guest-identifier.ts` always falls through to:

```ts
const fallbackFingerprint = CryptoJS.MD5(`${ip}-${userAgent}`).toString();
```

Every visitor sharing an IP and User-Agent becomes one guest identity. Two consequences, neither requiring an attacker:

1. **Shared quota** — the 3-analyses-per-day guest limit is per IP+UA, so an office or campus network gets 3 total, not 3 each.
2. **Cross-user data leak** — `AuthService.migrateGuestOffers(fingerprint, userId)` matches guest offers by that fingerprint. On signup a user **inherits strangers' offer letters** (salary, company, name) if they shared an IP and browser. This is in the guest→account funnel, which is the product's primary conversion path.

Side effect: the spoofing detector can never fire (one fingerprint per IP, threshold is 5), so that code is inert.

**Fix options**: send a real client-generated fingerprint, or drop fingerprint-based migration in favour of a signed guest cookie.

### 🔴 P0 — Missing ownership checks

Ownership enforcement is **correct** in `negotiation`, `benefits`, `comparison`, `correction`, and `career` — all check `offer.userId !== userId` and 403. The gaps are concentrated in the offer and analysis routes:

| Endpoint | Current | Problem |
|----------|---------|---------|
| `DELETE /offers/:id` | `requireRegistered`, no ownership check | **Any logged-in user can delete any other user's offer by ID.** `OfferService.delete()` only verifies existence |
| `GET /offers/:id` | no auth, no ownership | Returns `rawText` — the full offer letter |
| `GET /offers/:id/analysis` | no auth, no ownership | Full analysis exposed by ID |
| `GET /offers/:id/report` | no auth, no ownership | Roadmap specified registered-only (`GUEST_RESTRICTED`); it is fully open |

Root cause: `requireRegistered` in `middleware/authenticate.ts` proves *authentication* and never *ownership*. Fix it in one guard rather than per-route.

Compounding this: `offers.textHash` is `.unique()` **globally**, and `OfferService.create()` returns the existing offer's ID on a hash hit. Identical text from a different person hands you their offer ID, which the unauthenticated GETs then serve. Dedup should be scoped per user/guest.

### 🟠 P1 — Per-route rate limits are dead config

`config/constants.ts` defines 15 per-route limits in `RATE_LIMITS`. `middleware/rate-limiter.ts` registers exactly **one**: `global` at 100/min. Only `guestUpload` is separately enforced, inside `GuestService.checkLimits`.

So `authLogin: { max: 10, window: '15 minutes' }` is unused — login brute-force protection is 100/min, keyed on the IP+UA hash above. Same for `featureRequestCreate`, `negotiate`, `compare`, `corrections`, `benefits`, and the rest.

`POST /offers/extract` (Gemini) and `POST /offers/extract-file` (Google Vision) are **unauthenticated** with only that global limit between an anonymous caller and the GCP bill.

### 🟠 P1 — Path traversal on temp files

`OfferService.extractTextFromFile()` and `extractMetadata()` write ``temp-${uuidv4()}-${file.filename}`` to the process CWD with `file.filename` **unsanitized**.

### 🟠 P1 — Scanned PDFs cannot work

Actual OCR architecture is hybrid, and differs from what earlier docs imply:

```mermaid
graph LR
    F["File"] --> FE["frontend: pdf.js<br/>client-side extract"]
    FE -->|"text PDF: success"| TXT["text → POST /offers"]
    FE -->|"scanned PDF / image<br/>needsOCR"| BE["POST /offers/extract-file"]
    BE --> GV["Google Vision<br/>textDetection()"]
    GV -->|"image: ✅"| TXT
    GV -->|"PDF: ❌ unsupported"| ERR["fails"]

    style ERR fill:#ff6b6b,stroke:#333
```

`google-vision.ocr.ts` calls `client.textDetection(filePath)`. Vision's `textDetection` **does not accept PDF input** — that requires `asyncBatchAnnotateFiles` with a GCS bucket. Images work; scanned PDFs fail, which is precisely the case the fallback exists to serve.

Because the client-side path covers text PDFs, `ocr.worker.ts`'s Vision branch is largely bypassed in the real flow.

### 🟠 P1 — OCR confidence gate is inert

```ts
const confidence = result.fullTextAnnotation?.pages?.[0]?.confidence || 0.85;
```

A legitimate `0` becomes `0.85`. And when the gate does trip, `ocr.worker.ts` **hard-fails** the offer, where the spec called for `lowConfidence: true` plus an editable-text warning. `analysis.worker.ts` then writes `lowConfidence: false` hardcoded, so the signal never reaches the UI by either route.

### 🟡 P2 — Missing reliability paths from the roadmap

| Roadmap requirement | Status |
|---------------------|--------|
| Stale job reaper (`PROCESSING` > 5 min → `FAILED`) | ❌ Not implemented. `ANALYSIS_TIMEOUT_MS` is defined and never referenced. Stuck offers stay stuck forever |
| Redis-down fallback to synchronous processing | ❌ Not implemented. `ocrQueue.add()` throws |
| Guest TTL purge | ✅ Works. `cleanup.worker.ts` runs hourly; `migrateGuestOffers` correctly nulls `expiresAt` so migrated offers are not purged |

### 🟡 P2 — Smaller items

| Item | Detail |
|------|--------|
| Phantom dependency | `uuid` is imported in `offer.service.ts` and `guest-identifier.ts` but absent from `package.json`. `npm ls uuid` shows it resolving only via `bullmq`. Node 22 has `crypto.randomUUID()` — the dep is unnecessary as well as undeclared |
| Refresh tokens in `localStorage` | `services/api.ts`, 7-day lifetime, against the project's own stated standard of httpOnly cookies |
| pdf.js worker from CDN | `pdf-extractor.ts` loads the worker from `cdn.jsdelivr.net` at runtime. `vite-plugin-static-copy` is installed but absent from `vite.config.ts`, so self-hosting was likely intended |
| TOCTOU on guest limit | `checkLimits` runs before the transaction, `incrementAnalysisCount` inside it. Concurrent uploads can both clear the check |
| `spoofingTracker` memory | Unbounded in-memory `Map` keyed by IP, pruned only on window reset for that IP. Single-instance only |
| Dead code | `ANALYSIS_TIMEOUT_MS` unreferenced; `uuidv4` imported but unused in `guest-identifier.ts`; `vite-plugin-static-copy` unused |
| Duplicated extraction logic | `OfferService` has three near-identical methods (`extractTextFromFile`, `extractMetadata`, `extractMetadataFromText`) with **inconsistent provider gating** — one checks `NODE_ENV === 'production'`, the others don't |

---

## Proposed Architecture: Multi-Stage Pipeline

```mermaid
graph TB
    subgraph S1["🔍 Stage 1: Structured Extraction"]
        TEXT["Offer Text"] -->|"sanitize + JSON schema"| EXTRACT["AI: Extract Only"]
        EXTRACT -->|"Zod validate + retry"| V1["Validated Fields"]
    end

    subgraph S2["📊 Stage 2: Deterministic Enrichment (Parallel)"]
        V1 --> PA["Promise.all()"]
        PA --> SALARY["Salary Lookup + Cache"]
        PA --> RULES["Red Flag Rules"]
        PA --> TAX["Tax Calculator"]
        PA --> BENEFITS["Benefits Calc"]
    end

    subgraph S3["🧠 Stage 3: Contextual AI"]
        SALARY --> ANALYZE["AI: Analyze with Real Data"]
        RULES --> ANALYZE
        TAX --> ANALYZE
        BENEFITS --> ANALYZE
    end

    subgraph S4["✅ Stage 4: Score & Validate"]
        ANALYZE --> SCORE["Deterministic Scoring"]
        SCORE --> CONF["Confidence Tags"]
        CONF --> RESULT["Final Result"]
    end

    RESULT --> NEG["Negotiation"]
    RESULT --> COMP["Comparison"]
    RESULT --> CAREER["Career Path"]

    style S1 fill:#e8f5e9
    style S2 fill:#e3f2fd
    style S3 fill:#fff3e0
    style S4 fill:#f3e5f5
```

### Failure Isolation

Each stage produces a result OR a graceful fallback — a single stage failure never blocks the entire pipeline:

| Stage Failure | Fallback | Result |
|---------------|----------|--------|
| Salary lookup fails | AI estimate with `⚠️ AI Estimated` disclaimer | Degraded |
| Rule engine crashes | AI handles all red flag detection | Slightly less reliable |
| Tax calculator fails | Skip take-home section | Core analysis still available |
| Stage 3 AI fails | Return Stage 1 + Stage 2 data without AI narrative | Structured data only |
| Stage 1 extraction fails + retry fails | Fail the job, user can retry with different model | Hard failure |

---

## Stage 1: Structured Extraction (AI → Zod)

**Current**: Single prompt does extraction + analysis + salary comparison + negotiation tips simultaneously.

**Proposed**: Dedicated extraction-only prompt.

- **Sanitize input text** before embedding in prompt — strip control characters, unusual unicode, and prompt-injection patterns
- Use Gemini's **system instruction** (separate from user content) for the extraction schema
- Use Gemini's `responseSchema` parameter to enforce JSON structure at the model level
- Include **2-3 few-shot examples** of annotated extractions for consistency
- Validate output with Zod schema before proceeding
- If validation fails → retry once with validation error feedback
- **Post-extraction sanity checks**: flag suspicious values (CTC > ₹10Cr, CTC < ₹1L for experienced role)
- ~500 tokens per call (fast, cheap)

> [!IMPORTANT]
> **Key principle**: AI extracts what's IN the text. It does NOT analyze, compare, score, or generate salary data. This eliminates hallucination at the source.

**Extracted fields**:
```
├── companyName, role, department, location, industry, companyType
├── compensation (base, variable, equity, components, totalCTC)
├── benefits (name + verbatim value text)
├── dates (joining, offer expiry)
├── terms (notice period, probation, bond, non-compete)
├── restrictive clauses (verbatim quotes)
└── employmentType, currency
```

**Few-shot example structure** (include 2-3 in prompt):
```
EXAMPLE:
Text: "We are pleased to offer you Senior Software Engineer at Infosys, Bangalore. 
       Your annual CTC will be ₹18,00,000..."
Extraction: {"companyName": "Infosys", "role": "Senior Software Engineer", 
             "location": "Bangalore", "compensation": {"totalCTC": 1800000, "currency": "INR"}, ...}
```

---

## Stage 2: Deterministic Enrichment (No AI, Parallel)

All Stage 2 tasks run via **`Promise.all()`** — they're independent and shouldn't block each other.

### 2a. Salary Benchmarking — Real Data

**Current**: AI fabricates `marketRange: { p25, p50, p75, p90 }`.

**Proposed**: Hybrid real data + disclaimer system.

```mermaid
graph TD
    ROLE["Extracted Role + City"] --> CACHE{"Redis cache hit?"}
    CACHE -->|Yes| CACHED["Return cached stats"]
    CACHE -->|No| DB_CHECK{"≥10 salary submissions?"}
    DB_CHECK -->|Yes| REAL["Use Crowdsourced Data"]
    DB_CHECK -->|No| FUZZY{"Fuzzy match similar roles?"}
    FUZZY -->|Yes| APPROX["Use approximate data + caveat"]
    FUZZY -->|No| AI_EST["AI estimate + ⚠️ disclaimer"]
    
    REAL --> STORE["Cache in Redis (1hr TTL)"]
    APPROX --> STORE
    AI_EST --> STORE
    
    REAL -->|"dataSource: crowdsourced"| OUT["salary comparison"]
    APPROX -->|"dataSource: approximate"| OUT
    AI_EST -->|"dataSource: ai_estimated"| OUT
```

**Implementation details**:
- Wire existing `SalaryService.getStats(role, city)` into analysis worker
- **Fuzzy role matching**: synonym map (`"SDE" ≈ "Software Engineer" ≈ "Software Developer"`)
- **Experience-level filtering**: filter salary submissions by experience bracket, not just role+city
- **Redis caching**: `salary:{role}:{city}` key, 1-hour TTL
- **Minimum sample size**: `n ≥ 10` (raised from 5 for noise resistance)
- Add `dataSource` + `sampleSize` + `dataRecency` fields for UI transparency
- Seed DB with public salary data for bootstrapping

**Data integrity protections**:
- **Statistical outlier detection**: reject submissions >3σ from mean for that role/city
- **Recency weighting**: `weight = 1 / (1 + monthsOld × 0.1)` — older data counts less
- Consider requiring **email verification** for salary submissions

---

### 2b. Red Flag Rule Engine

**Current**: AI decides what's a red flag. May miss obvious ones or hallucinate non-existent ones.

**Proposed**: Pattern-based rules + AI supplement.

| Rule | Pattern | Severity | Type |
|------|---------|----------|------|
| Non-compete | `non-compete`, `restrictive covenant`, `not engage in` | high | `non_compete` |
| Service bond | `bond`, `minimum service`, `lock-in period`, `training cost recovery` | high | `bond` |
| Clawback | `clawback`, `repayment`, `recovery of`, `return of` | high | `clawback` |
| Broad IP assignment | `all intellectual property`, `assign to company`, `work product` | medium | `ip_assignment` |
| Vague compensation | `at discretion`, `may include`, `subject to`, `up to` | medium | `vague_compensation` |
| Probation risk | `terminated without notice during probation` | medium | `probation` |
| At-will clause | `at-will`, `terminate at any time` | low | `other` |
| Missing health insurance | Absence of `health`, `medical`, `insurance` | medium | `missing_benefit` |
| Missing PF/retirement | Absence of `provident fund`, `PF`, `retirement` | low | `missing_benefit` |

- Each rule-flagged issue tagged `source: "rule"` (deterministic)
- AI can still find nuanced issues, tagged `source: "ai"` (with lower confidence)
- UI shows source badge for transparency
- **Prefer `String.includes()` over regex** to avoid ReDoS — use regex only for complex patterns
- **100ms execution timeout** as safety net

---

### 2c. Take-Home Calculator (Indian Tax Regime)

**Current**: AI guesses "monthly take-home: approximately ₹X with assumptions."

**Proposed**: Deterministic calculator for Indian salaries.

| Component | Calculation |
|-----------|-------------|
| Basic salary | From extracted data or 40% of CTC (typical) |
| HRA exemption | min(actual HRA, 50%/40% of basic, rent - 10% of basic) |
| Standard deduction | ₹50,000 |
| EPF employee contribution | 12% of basic (capped at ₹15,000/month) |
| Professional tax | ~₹200/month (state-dependent) |
| Tax (new regime) | Slab-based calculation |
| Tax (old regime) | Slab-based with Section 80C, 80D deductions |

**Output**: Both old and new regime take-home comparisons with breakdown.

---

### 2d. Benefits Calculator (Existing — Enhance)

**Current**: `benefits.calculator.ts` does PTO valuation, insurance detection, and equity categorization — the *structure* is sound. The *numbers* are not: `extractNumber()` is unit-blind (see the corrected row in Feature-Level Problems above).

**Enhancements**:
- **Fix `extractNumber()` first** — handle lakh / L / LPA / Cr / crore multipliers, and decide range policy (take the low end, or return a range). This is a prerequisite, not an enhancement
- Add a **standard benefits checklist** (health insurance, PF, gratuity, leave encashment, WFH allowance, learning budget) — flag missing ones
- Add **industry-standard comparison** (e.g., "most product companies offer 18-24 days PTO, your offer has 12")
- Connect `BenefitBreakdown` totals into the scoring rubric

---

## Stage 3: Contextual AI Analysis

**Current**: AI does everything from scratch with no data.

**Proposed**: AI receives Stage 1 + Stage 2 outputs as context.

The AI prompt now says:
```
SYSTEM INSTRUCTION (separate from user content):
You are an expert compensation analyst. Analyze the following pre-extracted 
and enriched offer data. Do NOT re-extract or invent data — use what's provided.

USER CONTENT:
Here is the extracted offer data (verified from the text):
{extractedData}

Here is the salary benchmark for {role} in {city}:
{salaryComparison — source: crowdsourced/approximate/ai_estimated}

Here are the red flags identified by our rule engine:
{ruleEngineFlags}

Here is the tax-calculated take-home:
{takeHomeBreakdown}

Provide:
1. Executive summary (2-3 sentences)
2. Strengths of this offer
3. Concerns and negotiation leverage points
4. Any additional soft red flags the rules might have missed
5. Industry context for the compensation package
```

**Key design decisions**:
- AI is an *analyst commenting on real data*, not the *data source*
- **Do NOT re-send raw offer text** — only the structured extraction. Saves ~50% tokens
- Use Gemini **system instruction** to isolate analysis instructions from data (prompt injection defense)
- **Token budget**: max ~4K tokens input to Stage 3 (structured data is compact)

### Prompt Versioning

Store prompt template versions in `analysis.aiMetadata` for rollback and A/B testing:

```json
{
  "extractionPromptVersion": "v1.2",
  "analysisPromptVersion": "v1.0",
  "modelUsed": "gemini-2.5-flash",
  "totalTokensUsed": 3847
}
```

---

## Stage 4: Scoring & Validation

### Deterministic Scoring Rubric

**Current**: `score = 70 ± (flags × severity) ± (percentile bump)` — arbitrary.

**Proposed**:

| Component | Weight | Calculation |
|-----------|--------|-------------|
| **Salary Position** | 35% | `offerPercentile` from real salary data → 0-100 |
| **Red Flag Penalty** | 25% | 100 base, deduct per flag: High −20, Med −10, Low −5 |
| **Benefits Completeness** | 20% | % of standard benefits present from checklist |
| **Growth Signals** | 10% | Equity/ESOP, learning budget, title progression, RSU |
| **Transparency** | 10% | Compensation breakdown clarity, no vague terms |

### Confidence Tagging

| Level | Meaning | UI Treatment |
|-------|---------|-------------|
| `high` | Verbatim from offer text | Normal |
| `medium` | AI-inferred from context | 🟡 tag |
| `low` | AI-estimated, no evidence | 🟠 "AI Estimate" badge |
| `unverified` | No ground truth available | 🔴 disclaimer |

---

## Progressive UX (Frontend)

With 4 stages, processing takes longer. Instead of hiding behind a spinner, **stream partial results** as each stage completes:

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant W as Worker

    U->>FE: Upload offer
    FE->>W: Process

    W-->>FE: Stage 1 done → extraction
    Note over FE: Show company, role, CTC immediately

    W-->>FE: Stage 2 done → enrichment
    Note over FE: Reveal salary benchmark, red flags, take-home

    W-->>FE: Stage 3 done → AI narrative
    Note over FE: Show executive summary, strengths, concerns

    W-->>FE: Stage 4 done → final score
    Note over FE: Reveal score breakdown with animation
```

**Implementation options** (pick one):
- **Option A**: SSE (Server-Sent Events) for real-time stage updates
- **Option B**: Polling `GET /offers/:id` returns `{ stage: 2, partialResults: {...} }`
- **Option C**: Store stage results in DB progressively, frontend polls and renders as data arrives

Option B is simplest and works with existing polling architecture.

---

## Feature Improvements

### 🔄 Salary Comparison (Explorer Page)

| Change | Detail |
|--------|--------|
| **Wire into analysis pipeline** | Analysis worker calls `SalaryService.getStats()` at Stage 2a |
| **Fuzzy role matching** | Synonym map: `"SDE" ≈ "Software Engineer" ≈ "Software Developer"` |
| **Experience-level filtering** | Filter salary submissions by experience bracket, not just role+city |
| **Data quality indicators** | Show sample size (`n=47`) and data recency ("last 6 months") in UI |
| **Seed with public data** | One-time import from public salary datasets to bootstrap |
| **User contribution prompt** | After analysis, ask user to submit their salary anonymously to grow the DB |

---

### 📝 Negotiation Script

| Change | Detail |
|--------|--------|
| **Use real market data** | Pass the real salary benchmark (from Stage 2a) into the prompt |
| **Structured negotiation points** | Rule-engine flags become specific, defensible talking points |
| **Template library** | Pre-built templates for common scenarios (counter-offer, competing offer, relocation) |
| **Tone calibration** | AI receives specific instructions per tone: professional=formal, assertive=data-heavy, friendly=collaborative |
| **Output validation** | Validate script has: greeting, acknowledgment, specific asks with numbers, professional close |
| **Editable output** | Frontend: rich-text editor so user can tweak before sending |

---

### 🏆 Offer Comparison

| Change | Detail |
|--------|--------|
| **Real scores** | Comparison uses deterministic rubric scores (Stage 4), not AI-generated |
| **Dimension-by-dimension breakdown** | Show comparison across each scoring component (salary, benefits, flags, growth, transparency) |
| **AI-generated comparison narrative** | "If you value X, go with Offer A; if you value Y, go with Offer B" |
| **Visual radar chart** | Frontend: radar/spider chart comparing offers across 5 dimensions |
| **Weighted preferences** | Let user set priorities ("salary matters most" vs "benefits matter most") → re-rank |

---

### 🎯 Career Path

| Change | Detail |
|--------|--------|
| **Extract industry + company type** | Stage 1 extraction includes `industry` and `companyType` fields |
| **Company-specific context** | If company is known (e.g., Google, TCS), AI uses company-specific career ladders |
| **Salary progression with real data** | Year 1/3/5 salary ranges from crowdsourced DB filtered by experience level |
| **Skills-to-learn grounded in reality** | AI generates based on actual job market trends, not generic lists |

---

### 💰 Benefits Valuation

| Change | Detail |
|--------|--------|
| **Standard benefits checklist** | Define expected benefits per industry/company-type. Flag missing ones. |
| **Industry comparison** | "Most product companies offer X. Your offer includes/misses Y" |
| **Total comp visualization** | Frontend: stacked bar chart (base + variable + benefits + equity) |
| **User overrides** | Already supported (`overrides` param) — expose in UI |

---

### 💸 Take-Home Calculator (NEW)

| Feature | Detail |
|---------|--------|
| Indian tax calculation | Old vs new regime comparison |
| EPF contribution | Employee + employer |
| HRA exemption | Location-based (metro vs non-metro) |
| Professional tax | State-based |
| Monthly breakdown | Gross → deductions → net |
| What-if scenarios | "What if you negotiate ₹2L more base?" → instant re-calc |

---

## Implementation Phases

### Phase -1: Correctness & Security (1-2 days) — Blocks Launch

These are small, self-contained diffs and independent of the pipeline work. They ship first because two of them are live data-integrity problems, not quality problems.

| # | Task | Severity |
|---|------|----------|
| -1a | Send `X-Fingerprint` from the frontend, **or** replace fingerprint-based migration with a signed guest cookie | 🔴 P0 |
| -1b | Add an ownership check to `DELETE /offers/:id` — fix in the shared guard, not per-route | 🔴 P0 |
| -1c | Decide and apply the auth story for `GET /offers/:id`, `/analysis`, `/report` (guests need to poll their own offer, so this needs a guest-scoped token, not blanket `requireRegistered`) | 🔴 P0 |
| -1d | Scope `textHash` dedup per user/guest instead of globally | 🔴 P0 |
| -1e | Wire the per-route `RATE_LIMITS` that already exist, starting with `authLogin` | 🟠 P1 |
| -1f | Gate `POST /offers/extract` and `/extract-file` behind auth or a strict limit | 🟠 P1 |
| -1g | Sanitize `file.filename` before temp-file writes | 🟠 P1 |
| -1h | Fix the benefits `extractNumber()` unit handling (lakh / L / LPA / Cr) | 🟠 P1 |
| -1i | Declare `uuid` in `package.json`, or switch to `crypto.randomUUID()` | 🟡 P2 |

### Phase 0: Evaluation Framework (1 day) — Do This First

| # | Task | Why |
|---|------|-----|
| 0a | Collect 15-20 anonymized offer letters as test corpus | Can't improve what you can't measure |
| 0b | Manually annotate ground truth (company, role, CTC, benefits, red flags) | Baseline for accuracy comparison |
| 0c | Build test harness: run extraction → compare vs ground truth → report field-level accuracy | Tracks regression on every change |

**Target metrics**:
- Structured fields (company, role, CTC): > 90% accuracy
- Nuanced fields (benefits, clauses): > 75% accuracy

### Phase 1: Quick Wins (1-2 days)

| # | Task | Impact |
|---|------|--------|
| 1 | Add input sanitization (strip control chars, prompt-injection patterns) | Security |
| 2 | Wire `SalaryService.getStats()` into analysis worker | Real salary data |
| 3 | Add `responseSchema` to Gemini extraction call | Consistent JSON output |
| 4 | Add Zod validation on AI output in worker | Catch malformed responses |
| 5 | Split `buildPrompt()` into extraction vs analysis + few-shot examples | Better accuracy |
| 6 | Pass real salary data into negotiation prompt | Authentic negotiation points |
| 7 | Extract `industry` + `companyType` in Stage 1 | Fix career path context |

### Phase 2: Rule Engine + Tax Calculator (2-3 days)

| # | Task | Impact |
|---|------|--------|
| 8 | Build red flag pattern rule engine (includes > regex, 100ms timeout) | Reliable, deterministic detection |
| 9 | Build Indian tax take-home calculator | Accurate take-home |
| 10 | Implement weighted scoring rubric (5 components) | Fair, auditable scores |
| 11 | Add confidence tags to all output fields | User trust signals |
| 12 | Add standard benefits checklist + missing detection | Complete benefits analysis |
| 13 | Add salary data caching in Redis (1hr TTL) | Performance |

### Phase 3: Full Pipeline Refactor (2-3 days)

| # | Task | Impact |
|---|------|--------|
| 14 | Refactor worker into 4-stage pipeline with `Promise.all()` Stage 2 | Separation of concerns |
| 15 | Add partial failure fallbacks per stage | Reliability |
| 16 | Stage 3: Contextual AI via system instruction (no raw text re-send) | Grounded + secure |
| 17 | Add prompt versioning to `aiMetadata` | Rollback + A/B testing |
| 18 | Progressive results: store stage outputs, poll returns partial data | UX during longer processing |
| 19 | Update comparison to use rubric sub-scores | Dimension-by-dimension |
| 20 | Enhance career path with real context + salary progression | Realistic trajectories |
| 21 | Add negotiation template library | Non-AI fallback |
| 21a | Stale job reaper — `PROCESSING` > 5 min → `FAILED` (use the existing `ANALYSIS_TIMEOUT_MS`) | Stuck offers currently never recover |
| 21b | Redis-down fallback to synchronous processing | Roadmap requirement, not implemented |
| 21c | Scanned-PDF OCR via `asyncBatchAnnotateFiles` + GCS, or a different provider | Scanned PDFs currently fail outright |
| 21d | Make the OCR confidence signal real: drop the `\|\| 0.85` default, surface `lowConfidence` instead of hard-failing | Confidence gate is currently inert end-to-end |
| 21e | Consolidate `OfferService`'s three duplicate extraction methods into one with consistent provider gating | Removes divergent `NODE_ENV` behaviour |

### Phase 4: Data Flywheel (Ongoing)

| # | Task | Impact |
|---|------|--------|
| 22 | Add fuzzy role matching (synonym map) | Better salary matches |
| 23 | Seed salary DB with public datasets | Bootstrap benchmarks |
| 24 | Salary data poisoning protection (3σ outlier rejection, recency weighting) | Data integrity |
| 25 | Post-analysis salary contribution prompt | Grow crowdsourced data |
| 26 | User correction loop → improve extraction rules | Self-improving system |
| 27 | PII redaction + 90-day raw text retention policy | Compliance |

---

## Before vs After Comparison

| Feature | Before (Current) | After (Proposed) |
|---------|-------------------|------------------|
| **Extraction** | Single mega-prompt, AI guesses schema | Dedicated prompt + `responseSchema` + Zod + few-shot examples |
| **Salary Comparison** | AI hallucinated p25/p50/p75/p90 | Crowdsourced DB → fuzzy match → AI fallback with disclaimer |
| **Red Flags** | AI-only, may hallucinate | Rule engine + AI for nuance, source-tagged |
| **Take-Home** | AI estimated | Deterministic Indian tax calculator (old + new regime) |
| **Score** | `70 ± adjustments` | 5-component weighted rubric (35/25/20/10/10), auditable |
| **Negotiation** | AI script based on fake salary data | AI script grounded in real market data + rule-engine talking points |
| **Comparison** | Deterministic but AI-sourced inputs | Real scores, dimension-by-dimension, weighted preferences |
| **Career Path** | `industry: 'Technology'`, hardcoded | Extracted industry + company context + real salary progression |
| **Benefits** | Deterministic structure, but unit-blind number parsing (₹5 lakh → `5`) | Unit-aware parsing + standard checklist, industry comparison |
| **Confidence** | None | Per-field confidence with 4 levels + UI badges |
| **Prompt security** | Raw text in prompt | Input sanitization, system instruction isolation, sanity checks |
| **Failure** | All or nothing | Per-stage fallback, partial results |
| **Measurement** | None | Test corpus + field-level accuracy tracking |
| **Authorization** | Ownership enforced on 5 feature modules; absent on offer read/delete/report | Single guard covering ownership for every offer-scoped route |
| **Guest identity** | Collapses to MD5(IP + User-Agent) — quota and migration shared across users | Per-browser identity, no cross-user inheritance |
| **Rate limiting** | One global 100/min; 15 per-route limits defined but unused | Per-route limits actually registered |

---

## Decisions Needed

### On the security phase (new — blocks everything)

1. **Guest identity**: real client fingerprint sent as `X-Fingerprint`, or signed guest cookie? The cookie is more robust and removes the spoofing-detection code entirely.
2. **Read access to offers**: how should a guest poll their own offer without an account? Options: guest-scoped JWT issued on first visit, or a per-offer unguessable access token returned at upload.
3. **Migration safety**: given the fingerprint collapse already in production-shaped code, do any existing records need auditing for wrongly-migrated offers before the fix ships?

### On the pipeline

4. **Phase priority**: Phase -1 → Phase 0 (evaluation) → Phase 1 (quick wins), or something else?
5. **Tax calculator scope**: Indian-only for now, or plan for multi-country?
6. **Salary data seeding**: Import a public dataset, or start from scratch with crowdsourced data?
7. **Scoring weights**: Are 35/25/20/10/10 (salary/flags/benefits/growth/transparency) reasonable?
8. **Role synonym map**: Manual mapping or use AI to normalize role names?
9. **Progressive UX approach**: SSE, polling with partial results, or simpler approach?
10. **Frontend scope**: How much UI work in this plan, or keep backend-focused?
11. **Testing**: there is currently no real test suite. Does Phase 0's eval harness double as the entry point for backend unit tests, or is a test setup its own task?
