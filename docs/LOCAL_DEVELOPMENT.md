# Running and testing OfferLens locally

Everything below was executed on a clean Windows machine with Docker. Where a step has a
gotcha, the gotcha is stated rather than left to be discovered.

---

## 1. Prerequisites

| Tool | Version used | Notes |
|---|---|---|
| Node | 22+ | `node --version` |
| Docker Desktop | any recent | Must be **running**, not just installed |
| An AI API key | — | Optional. Gemini, OpenAI or Anthropic — see §3.1. Without one the app uses a mock provider and returns canned analysis |

Google Cloud Vision credentials are optional too. Without them the app uses a mock OCR
provider, which is usually what you want locally.

---

## 2. Start Postgres and Redis

```bash
cd backend
docker compose up -d
docker compose ps          # both should read "Up"
```

That gives you Postgres 16 on `5432` and Redis 7 on `6379`, matching the defaults in
`.env.example`. You'll see a warning about the `version:` attribute being obsolete —
harmless.

---

## 3. Configure the backend

```bash
cd backend
cp .env.example .env
```

Then fill in the two **required** secrets. The server refuses to boot without them, by
design — it validates config at startup rather than failing later:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Run it twice and paste the results into `JWT_SECRET` and `JWT_REFRESH_SECRET`. Add an AI key
if you have one — see §3.1.

### 3.1 Choosing an AI provider

Three are supported. Set `AI_PROVIDER` and the matching key:

```bash
AI_PROVIDER=gemini        # gemini | openai | anthropic | mock
GEMINI_API_KEY=...
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...
```

Gemini is the default because it is the one with a usable free tier, which is what the free
plan is built on. With no key for the selected provider the app falls back to the mock and says
so in the log — fine for checking the app runs, useless as analysis.

`GEMINI_MODEL` / `OPENAI_MODEL` / `ANTHROPIC_MODEL` pin a specific model. Leave them blank
unless you have a reason: each provider already picks a sensible model per task, and a model id
from one provider means nothing to another.

#### Switching provider without restarting

Editing `.env` and restarting both the API and the workers gets old fast. Set:

```bash
ALLOW_AI_REQUEST_OVERRIDE=true
```

...and any request can name its own provider, model and key:

```bash
curl -X POST http://localhost:8000/api/v1/offers/extract \
  -H 'content-type: application/json' \
  -H 'X-AI-Provider: openai' \
  -H 'X-AI-Model: gpt-4.1-mini' \
  -H 'X-AI-Key: sk-...' \
  -d '{"text":"OFFER: Senior Engineer, CTC INR 24,00,000"}'
```

The selection travels with the queued job, so an upload is analysed by the provider the request
asked for, not by the server default.

> [!WARNING]
> **Development only.** This is refused in production regardless of the flag — the check on
> `NODE_ENV` is hardcoded and not configurable. An endpoint that accepts an arbitrary API key
> and an arbitrary model name lets a caller bill expensive models to your key, or proxy
> requests on someone else's credentials from your IP. It is also off by default, so a
> non-production deployment does not get it merely by not being production.
>
> Headers are ignored rather than rejected when the gates are shut, so a prober learns nothing.
> A key supplied this way is scrubbed from the job payload once the job settles, because BullMQ
> keeps completed job data for an hour and failed jobs for a day.

---

Leave `PORT=8000` and `CORS_ORIGIN=http://localhost:8080` alone unless you know why you're
changing them — they must match the frontend, and a mismatch produces a browser CORS
failure rather than a clear error.

---

## 4. Install and prepare the database

```bash
cd backend
npm install
npm run db:migrate     # build the schema
npm run db:seed        # roles, cities, experience levels
```

> [!WARNING]
> Use `db:migrate`, **not** `db:push`. `drizzle.config.ts` sets `strict: true`, so `push`
> waits on an interactive confirmation and appears to hang forever.

---

## 5. Configure and install the frontend

```bash
cd frontend
cp .env.example .env
npm install
```

`VITE_API_BASE_URL` defaults to `http://localhost:8000/api/v1`, which matches the backend.
`VITE_GOOGLE_CLIENT_ID` can stay blank — the Google sign-in button just won't render.

---

## 6. Run it

Three processes, three terminals. The API and the workers are separate: **an offer will
upload but never get analysed if you forget the workers.**

```bash
# terminal 1 — API
cd backend && npm run dev

# terminal 2 — background workers (OCR + analysis + cleanup)
cd backend && npm run workers

# terminal 3 — frontend
cd frontend && npm run dev
```

| Service | URL |
|---|---|
| App | http://localhost:8080 |
| API | http://localhost:8000/api/v1 |
| API docs (Swagger) | http://localhost:8000/api/v1/docs |

> [!NOTE]
> `npm run dev` and `npm run workers` use `tsx watch`. Watch mode treats **any keystroke in
> that terminal as a restart signal**, including a stray Enter — which kills in-flight
> requests. If you're running the test scripts against it and see `ECONNRESET`, that's
> usually why. For stable test runs use `npx tsx src/server.ts` and
> `npx tsx src/workers/index.ts` instead.

Confirm everything is up:

```bash
curl http://localhost:8000/api/v1/health
```

---

## 7. Automated test suites

### Unit tests — no services required

```bash
cd backend && npm test        # 251 tests
cd frontend && npm test       # 1 placeholder test
```

These need no database, no Redis and no API key. They cover the pure decision logic:
access control, guest identity, dedup scoping, AI retry classification, benefits currency
parsing and categorisation, filename and prompt sanitisation, salary percentile ranking,
the red-flag rule engine, the eval scorer, and the frontend↔backend contract.

The rule engine tests (`redflag.rules.test.ts`) are worth knowing about if you touch
detection. They run against two corpus letters that share the same clause slots written
hostile and written favourable, so they catch both directions: a rule that stops firing on a
genuine non-compete, and a rule that starts firing on one that is explicitly disclaimed.

The contract test checks both **paths** and **response shapes**. The shape half exists
because three separate breaks had the path right and the shape wrong — a page reading
`a.score` that the server never sent, and three drawers reading `milestone.skills`,
`data.benefits` and `data.fields` against endpoints that return `timeline`, `breakdown` and
an array. A path-only check passed all four.

```bash
cd backend
npm run lint          # tsc --noEmit + eslint — passes
```

> [!NOTE]
> `npm run format:check` currently **fails on 69 files**. Prettier was added in `-1C` but
> never applied to the existing code, so the config exists and the codebase predates it.
> This is cosmetic and not enforced in CI. Fixing it is one command — `npm run format` —
> but it rewrites nearly every file, so it deserves its own commit rather than being mixed
> into feature work.

### Integration suites — need the full stack running

Run these with the API **and** workers up. Each is self-contained and creates its own
users and offers.

```bash
cd backend
node test-security.mjs    # 20 assertions — authorization and guest identity
node test-m2.mjs          # 25 — auth, migration, and registered-user features
node test-m3.mjs          # 19 — forum, crowdsourced salary, career path
```

Expected: `0 failed` on all three. They exit non-zero on failure, so they can gate a build.

A result may read `KNOWN` rather than `PASS`. That means a failure that is already
understood and has planned work, deliberately excluded from the exit code — a permanently
red suite gets ignored, and then a real regression hides in it. There are currently none.

| Suite | What it proves |
|---|---|
| `test-security.mjs` | A second browser gets its own identity; one guest cannot read another's offer, analysis or PDF; identical text gets its own record; guest offers are claimed on signup; a stale guest cookie loses access afterwards; no logged-in user can delete another's offer |
| `test-m2.mjs` | Guest upload → analysis completes → signup migrates it; negotiation script, benefits, career path, corrections, PDF export, offer comparison, dashboard, account deletion |
| `test-m3.mjs` | Forum posting and commenting, anonymous posting refused, salary submit + validation + rate limit, stats thresholds, career path |

### Extraction accuracy eval — needs an AI key

```bash
cd backend
npm run eval                        # all 17 cases, one pass, configured provider
npm run eval -- --runs 3            # three passes, averaged — use this for any number you quote
npm run eval -- --provider openai   # same corpus, a different provider
npm run eval -- --provider anthropic --model claude-haiku-4-5
npm run eval -- --limit 4           # quick loop
npm run eval -- --save              # write eval/results/<timestamp>.json
```

`--provider` is how you compare them: the same 17 cases, scored identically, against the same
noise floor. Combined with the per-analysis cost now in the log, that answers "which provider
reads offer letters best, and what does each cost" with numbers instead of impressions.

Current, over 17 cases × 3 passes: **96.1% structured** (target 90%), **82.3% nuanced**
(target 75%). Always exits 0 — it's a measurement, not a gate.

**The most useful line it prints is the last one:**

```
Noise floor over 3 passes: 2.4%.
Treat a change below that as unmeasured, not as an improvement.
```

A single pass can't tell a small gain from the model having a different day, so `--runs 1`
is for the iteration loop only. The header says so when you use it.

Red flags are reported three ways, because task 8 added a deterministic rule engine that
runs alongside the model:

```
red flags (F1)       80.8%  [77.3% – 83.1%]   (MERGED — what the worker stores)
  ├ model only       78.0%  [76.1% – 79.0%]   varies run to run
  └ rules only       77.4%  [77.4% – 77.4%]   deterministic (task 8)
```

Rules-only having zero spread is a deliberate self-check: the engine is pure, so if that
range ever widens, the harness or a rule is broken, not the model. It printed a warning and
caught a real aggregation bug once already.

See [eval/README.md](../backend/eval/README.md) for why the absolute number shouldn't be
quoted: 16 of the 17 letters are synthetic.

Expect 429s on a free-tier key. The provider falls through to another model automatically
and logs when it does.

---

## 8. Manual walkthrough

The automated suites cover the API. This covers the browser, which they can't.

### 8.1 Guest analysis — the core journey

1. Open http://localhost:8080 in a normal window and go to **Upload**.
2. Paste an offer letter into the text box. Use
   [`backend/eval/corpus.ts`](../backend/eval/corpus.ts) for realistic samples with known
   red flags — `05-red-flag-heavy` is a good one.
3. Fill in role, city and experience level. **Expected:** the dropdowns populate from the
   API. Empty dropdowns mean the API isn't reachable.
4. Submit. **Expected:** redirect to a processing page, then results within roughly 10-30s.
5. On the results page, expect a score gauge with a real number, the company name and role
   as headings, red flags with quoted excerpts, and a benefits list.

> **What "working" looks like:** a red-flag-heavy letter should score **low** (30-40, "weak"
> or "poor"), not a flat 70. Company and role should be the real values, not the
> placeholders "Company" and "Role". If you see 70/"fair" with blank headings, the analysis
> came back empty.

### 8.2 Guest isolation

1. Copy the results URL.
2. Open it in a **different browser** (or a private window — a new tab shares cookies).
3. **Expected:** not found. That URL is bound to the first browser's guest cookie.

### 8.3 Guest quota

Upload four offers as a guest. The fourth should be refused with a prompt to create an
account. Note the limit is now genuinely per-browser — before `-1A` everyone on the same
network shared one allowance.

### 8.4 Signup and claiming

1. As a guest with at least one analysis, sign up.
2. **Expected:** the dashboard lists the offer you analysed before registering.

### 8.5 Registered features

From a results page while signed in: **Generate Negotiation Email**, **Calculate Full
Benefits Value**, **Career**, **Correct**, **PDF**. Each should return content rather than
an error.

Then **Compare** with two completed offers, and check the dashboard shows a score
distribution.

### 8.6 Salary Explorer

1. Go to **Salaries**, search a role and city. **Expected:** either percentiles, or an
   honest "not enough data yet" message. Both are correct — the message is what real
   traffic sees until the table fills.
2. Submit a salary. **Expected:** success. A second submission within the hour should be
   rate-limited.

### 8.7 Forum

Create a post signed in, comment on it, then confirm posting while signed out is refused.

---

## 9. Known limitations — not bugs

Things you may notice that are understood and tracked:

| Behaviour | Why |
|---|---|
| Salary benchmarks say "estimated, not enough submissions" | Correct. Real crowdsourced data needs Phase 4 seeding |
| Score says "Estimated score — limited market data" | Follows from the above. Honest labelling |
| Salary chart is a flat line locally | The test scripts insert identical values, so all four percentiles match |
| A **scanned** PDF fails | Cloud Vision's `textDetection` doesn't accept PDF input. Text PDFs and images work |
| Take-home shows a **range**, not one figure | Correct, and deliberate. PF is 12% of basic, and whether an employer deducts on full basic or only to the ₹25,000 statutory ceiling is policy the letter does not state. At ₹1,00,000 monthly basic that is ₹9,000/month of take-home. Open "What this assumes" for the full list |
| Take-home looks higher than you expected | It excludes PF entirely when the letter never states basic separately, which is most letters. That is said in the assumptions list. It also treats full CTC as taxable salary, which slightly overstates tax in the other direction |
| No old-regime comparison | The old regime needs your HRA, home-loan interest and 80C figures. An offer letter contains none of them, so a comparison would be invented |
| Red flags occasionally missed or over-reported | Improved a lot, not solved: **86% F1 merged** against ~75% model-only. Tasks 8 and 12 made the well-known clauses and the absent-benefit case deterministic; what remains is inference the model still does, and that part varies run to run |
| "Against a standard offer" says something is missing that you were told you'd get | The checklist reports what the **letter** says, not what a recruiter said. Silence means the entitlement is set by policy later, which is exactly why it is worth getting in writing |
| Only three items can trigger the missing-benefits flag | Deliberate. Ordinary offers omit one thing constantly — a checklist that flags every gap gets ignored. Gratuity, term life, learning budget and flexible working are reported but never flagged |
| A hostile letter now scores lower than it used to | Expected. The rule engine catches clauses the model was missing, and each one costs 5-15 points. The `test-m2.mjs` fixture went to "poor", which is right for a letter with no-notice probation and a 12-month non-compete |
| Benefits drawer lists every benefit with no rupee value | Correct when the letter doesn't quantify them. "Medical Insurance" with no sum assured and "Paid Leave" with no day count are not valuable — the calculator reads amounts, it doesn't invent them. Enter your own figure and recalculate |
| Provident Fund shows no value even though PF is statutory | PF is 12% of **basic**, and a letter quoting a single CTC figure never states basic. Guessing a basic-to-CTC ratio would push a fabricated number into total comp. Phase 2's salary breakdown gives it a real value |
| Base salary equals total CTC on a CTC-only letter | Known and measured — `base := CTC` fires on 5 of 17 eval cases. The response schema marks `baseSalary` required, so the model must supply a figure the letter doesn't contain. Fix is queued at the front of task 9 |
| Joining bonus stated in prose is sometimes dropped | Known: stated-components F1 ~78%. Reproduced on the real eval case in two consecutive runs |
| OpenAI and Anthropic model ids are unverified | No key for either was available when the adapters were written. The ids in `src/config/constants.ts` are best-effort and flagged as such; override with `OPENAI_MODEL` / `ANTHROPIC_MODEL` if a call 404s |
| No content moderation on forum or feature requests | Not built |
| `GET /account/export` doesn't exist | Promised in the privacy policy, not implemented |

---

## 10. Troubleshooting

| Symptom | Cause |
|---|---|
| Server exits on boot | `JWT_SECRET` or `JWT_REFRESH_SECRET` missing or under 32 chars |
| Offers stay `QUEUED` forever | The workers process isn't running |
| CORS error in the browser console | `CORS_ORIGIN` doesn't match the frontend origin exactly, scheme and port included |
| Guest features behave oddly across tabs | Expected — identity is a per-browser cookie |
| `db:push` hangs | Use `db:migrate`. See §4 |
| `ECONNRESET` mid-test | `tsx watch` restarted from a stray keystroke. See §6 |
| Analysis fails with a rate-limit message | Gemini free-tier quota. Wait, set a different key, or switch provider with `AI_PROVIDER` |
| Log says "using MockAiProvider" | No key for the selected `AI_PROVIDER`. Responses are canned sample data |
| `X-AI-Provider` header seems ignored | `ALLOW_AI_REQUEST_OVERRIDE` is not `true`, or `NODE_ENV=production`. Both gates must pass. See §3.1 |
| A provider returns 404 for the model | A model id from one provider passed to another, or an id that has been retired. Clear `*_MODEL` to use the provider's default |
| Dropdowns empty on the upload form | `npm run db:seed` not run, or the API is unreachable |

### Resetting

```bash
cd backend
docker compose down -v      # deletes all data
docker compose up -d
npm run db:migrate && npm run db:seed
```

---

## 11. What is verified, and what isn't

Being precise about this, because "the tests pass" is not the same as "the app works".

**Verified by execution:** both packages typecheck and lint clean; 251 backend unit tests;
the frontend builds (177.6 KB gzip initial); all three integration suites pass against a
live stack with a real Gemini key; extraction accuracy measured at 96.1%/82.3% over three
passes with a 2.4% noise floor; the browser
integration seam (CORS preflight, credentialed cookies, `HttpOnly`/`SameSite`/`Path`,
rejection of unlisted origins); the frontend dev server serves and SPA deep routes resolve.

**Not verified:** the UI has never been driven through a real browser by an automated test.
Every backend behaviour behind the screens is covered, but rendering, form validation and
navigation have only been checked by reading the code and confirming the data contract.
§8 exists because a human still needs to click through it.

There are also **no frontend component tests** — the one frontend test is a placeholder.
That's the largest remaining gap in coverage.

> [!WARNING]
> This gap is not theoretical. Every one of the four bugs found in the results-page drawers
> was found by a human opening the drawer, not by a test:
>
> - `CareerTimeline` read `milestone.skills`, which the API never sends. It threw, and with
>   no error boundary in the tree the whole page went white.
> - `BenefitsPanel` read `data.benefits` and `b.value` instead of `breakdown` and
>   `monetaryValue`, so it always claimed "no benefits data found".
> - `CorrectionsPanel` read `data.fields` off a response that is an array, and submitted
>   `{ fields: … }` against a schema requiring `{ corrections: [ … ] }` — broken in both
>   directions, so nothing rendered and nothing would have saved.
> - Provident Fund was categorised "Other" because the retirement branch had no return on
>   its unquantifiable path.
>
> All four are fixed, and the contract test now asserts response shapes rather than only
> paths. But the class of bug recurs, and the thing that catches it is a browser driving the
> UI. Playwright against the §8 walkthrough is the smallest thing that would close it.
