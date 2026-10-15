# OfferLens Deployment Guide

How to deploy the whole app: the API, the background workers and the frontend. For running it on
your own machine, see `LOCAL_DEVELOPMENT.md`.

> **Deploying to the shared VPS (`offerlens.mueens.tech`)?** Follow the ordered, copy-paste
> runbook in [`DEPLOY_VPS.md`](DEPLOY_VPS.md) instead — it wraps this reference with the exact
> commands for that one box (host nginx one origin, loopback-only Docker ports, SSH-tunnel
> migrations, the `deploy/` artifacts). This file stays the general "what the app needs"
> reference. Two behaviours it relies on: set **`TRUST_PROXY=1`** (section 7) behind the single
> host nginx, and in production image/scanned-document OCR without a real provider is refused
> with `400 OCR_UNAVAILABLE` rather than returning canned text (section 5, "Honest OCR"). Set
> `OCR_PROVIDER=azure` (+ the two Azure vars) to enable images and scanned PDFs.

The app is three things that must all be running:

| Part | What it is | Started with |
|---|---|---|
| API | Fastify HTTP server | `npm start` (from `backend/`) |
| Workers | BullMQ workers: OCR, analysis, the stuck-job reaper (every minute), expired-guest cleanup (hourly) | `npm run start:workers` |
| Frontend | Static files from `vite build` | any static host with an SPA fallback |

The API alone processes nothing: without the workers, uploads stay `QUEUED` and the reaper fails them after about 5 minutes.

---

## 1. Requirements

| Need | Version / note |
|---|---|
| Node.js | **22.13+** (`pdfjs-dist` requires it; `backend/package.json` `engines` enforces it) |
| PostgreSQL | 16 |
| Redis | 7 or newer (the per-email login limiter uses `PEXPIRE ... NX`). Use a plain `redis://[:password@]host:port` URL: see the limitation below. BullMQ recommends `maxmemory-policy noeviction` on its Redis |
| Shared storage | API and workers must see the **same** `STORAGE_PATH` directory. The API writes an upload, the OCR worker reads it. Files are deleted after extraction |
| HTTPS | On both the frontend and the API host (section 5) |
| A repo checkout | Migrations, seed and the data loaders run from a checkout with `npm ci` (dev dependencies), not from the runtime Docker image |

**Redis limitation.** BullMQ builds its connection from the URL's hostname, port and password only
(`queue/queues.ts`, `workers/worker.ts`). TLS (`rediss://`), a username and a database index in
`REDIS_URL` are ignored by the queues, and the password is not URL-decoded, while the cache and rate
limiter (ioredis) honour the whole URL. Many managed Redis services require TLS or a username, so the
queues fail against them. Use a plain `redis://` instance until the queue connection is built from the
full URL (open item in the plan). The API will not boot if Redis is unreachable.

---

## 2. Environment variables

Copy `backend/.env.example` to `backend/.env`. The only place the backend reads `process.env` is
`backend/src/config/env.schema.ts`, validated at boot; invalid values stop the process.
`db:seed` and the loaders load the same config, so they need the **full** `.env` (both JWT secrets at minimum),
not just `DATABASE_URL`. `db:migrate` itself only reads `DATABASE_URL`.

**Set `NODE_ENV=production` on any deployed server.** It makes the guest cookie `Secure`, refuses the AI
request override even if `ALLOW_AI_REQUEST_OVERRIDE` is set, and hides the dev model picker. When you pass
the file to Docker with `--env-file`, it overrides the image's own `NODE_ENV=production`, so the file must say it too.

### Backend

| Variable | Required | Default | Validation | Notes |
|---|---|---|---|---|
| `NODE_ENV` | **set to `production`** | `development` | `development` / `production` / `test` | See above |
| `PORT` | no | `8000` | number | The image exposes 8000 |
| `CORS_ORIGIN` | **yes in practice** | `http://localhost:8080` | string | The exact frontend origin (scheme, host, port). One value, no wildcard: credentials are on |
| `DATABASE_URL` | **yes** | none | non-empty | Not the compose default `postgres:postgres` |
| `REDIS_URL` | no | `redis://localhost:6379` | string | Plain `redis://`, see section 1 |
| `JWT_SECRET` | **yes** | none | 32+ chars | Also the cookie-signing fallback |
| `JWT_REFRESH_SECRET` | **yes** | none | 32+ chars | Use a different value |
| `COOKIE_SECRET` | recommended | falls back to `JWT_SECRET` | 32+ chars **if present** | Leave the line out entirely rather than blank: an empty value fails boot |
| `AI_PROVIDER` | no | `gemini` | `gemini` / `openai` / `anthropic` / `mock` | |
| `GEMINI_API_KEY` | one key for the chosen provider | none | optional | No key for the selected provider silently selects the **mock** provider (canned output) |
| `OPENAI_API_KEY` | see above | none | optional | |
| `ANTHROPIC_API_KEY` | see above | none | optional | |
| `GEMINI_MODEL`, `OPENAI_MODEL`, `ANTHROPIC_MODEL` | no | built-in per-task defaults | optional | Leave blank. The OpenAI and Anthropic ids are unverified against live keys |
| `ALLOW_AI_REQUEST_OVERRIDE` | no | off | `z.coerce.boolean()` | **Leave unset.** Any non-empty value, including `false` and `0`, parses as true. Production ignores it anyway |
| `OCR_PROVIDER` | no | `mock` | `mock` / `google` / `azure` | Which provider serves OCR. `mock` is refused in production (`OCR_UNAVAILABLE`). `azure` reads images **and** scanned PDFs; `google` reads images only. See section 5 |
| `AZURE_DOC_INTELLIGENCE_ENDPOINT` | with `OCR_PROVIDER=azure` | none | url | Document Intelligence endpoint, e.g. `https://<name>.cognitiveservices.azure.com`. Encodes the region (Central India) |
| `AZURE_DOC_INTELLIGENCE_KEY` | with `OCR_PROVIDER=azure` | none | string | API key. **Secret** — set only in `.env.production` (chmod 600), never commit. Needed by **both** the API and workers |
| `GOOGLE_CLOUD_CREDENTIALS` | with `OCR_PROVIDER=google` | none | path | Service-account JSON for Cloud Vision (images only). The file must exist in **both** the API and workers (a missing file crashes the worker). Relative paths resolve from the process cwd. Not `GOOGLE_APPLICATION_CREDENTIALS` |
| `GOOGLE_CLIENT_ID` | no | none | optional | Enables "Sign in with Google" (audience check); without it `/auth/google` returns 503. Same client as the frontend `VITE_GOOGLE_CLIENT_ID` |
| `GOOGLE_CLIENT_SECRET` | no | none | optional | Declared in the schema but **unused**: nothing reads it |
| `STORAGE_PATH` | no | `./uploads` | string | Shared between API and workers |
| `LOG_LEVEL` | no | `info` | `fatal` / `error` / `warn` / `info` / `debug` / `trace` | Sets the Fastify/pino level |
| `TRUST_PROXY` | **set to `1` behind this guide's nginx** | `0` (off) | integer `0`-`5` | Number of trusted proxy hops, passed to Fastify `trustProxy`. `0` is off (`request.ip` is the socket address); a positive count makes the rate-limit and login-IP buckets see the real client. See section 7 |

### Frontend (build time)

Vite inlines these into the bundle when you run `npm run build`. They are public; never put a secret here.

| Variable | Required | Default | Notes |
|---|---|---|---|
| `VITE_API_BASE_URL` | **yes for production** | `http://localhost:8000/api/v1` | The public API URL **including** `/api/v1` |
| `VITE_GOOGLE_CLIENT_ID` | no | empty (button hidden) | Same client as backend `GOOGLE_CLIENT_ID` |

Generate secrets with `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.

---

## 3. Deployment checklist

Do these in order. Steps 2 to 8 run from a checkout; step 9 can instead use the Docker image (section 4).

1. **Provision.** Node 22.13+, Postgres 16, Redis 7, a writable directory (or volume) for `STORAGE_PATH`, an HTTPS reverse proxy, two same-site hostnames (for example `app.example.com` and `api.example.com`). Do not reuse the compose credentials.
2. **Clone and install.**
   ```bash
   git clone <repo> && cd offerlens/backend
   npm ci          # keep dev dependencies: migrate, seed and loaders need tsx and drizzle-kit
   ```
3. **Configure.** `cp .env.example .env` and set at least `NODE_ENV=production`, `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `JWT_SECRET`, `JWT_REFRESH_SECRET`, `COOKIE_SECRET`, the AI key for `AI_PROVIDER`, and `STORAGE_PATH`. Do not reuse the old service-account key (see section 7).
4. **Set `TRUST_PROXY`** (section 7) if the API sits behind any proxy or load balancer. With this guide's single host nginx, set `TRUST_PROXY=1` in `.env`. No code edit, no rebuild.
5. **Migrate.** `npm run db:migrate` applies migrations `0000` to `0008`. Never use `db:push`.
6. **Seed (required, safe to re-run).** `npm run db:seed` fills roles, cities and experience levels. Without it the upload dropdowns are empty.
7. **Salary reference data (gated, section 6).** `npm run db:load-reference`. Optional for the app to run: without rows, salary is "not scored".
8. **City pay factors (gated, optional, section 6).** `npm run db:load-city-factors`, after migration `0008`. Safe to skip: every city then gets the national survey figures.
9. **Build and start the API and the workers as two processes** on the same host/volume:
   ```bash
   npm run build          # tsc, then tsc-alias rewrites the "@/" path aliases
   npm start              # API:      node dist/src/server.js
   npm run start:workers  # workers:  node dist/src/workers/index.js
   ```
   Do not use `npm run dev` or `npm run workers` in production: they are `tsx watch`.
10. **Build the frontend.**
    ```bash
    cd ../frontend
    npm ci
    VITE_API_BASE_URL=https://api.example.com/api/v1 VITE_GOOGLE_CLIENT_ID= npm run build
    ```
    Serve `frontend/dist/` over HTTPS with an SPA fallback (every unknown path returns `index.html`, or deep links such as `/results/...` 404). In nginx: `location / { try_files $uri /index.html; }`.
11. **Health check.** `GET /api/v1/health` returns `{status, version, timestamp, uptime}`. It proves only that the process is up. It does **not** query Postgres or Redis, so it stays green if the database dies after boot. Also check the logs (below).
12. **Smoke test.** Upload a sample letter as a guest and wait for the result. Optionally run the Playwright spec (`LOCAL_DEVELOPMENT.md` section 7: needs a real Gemini key, makes 4+ model calls and creates an `e2e-<timestamp>@example.com` user to delete afterwards).
13. **Post-deploy checks.** In a browser: the `ol_guest` cookie is `HttpOnly` and `Secure`; saving a correction works (needs `PATCH` in CORS, which is allowed); sign-up and login work; the rate-limit header `x-ratelimit-limit` is present; two different clients get separate IP buckets (proves `trustProxy`); `/api/v1/docs` is reachable or blocked as you intend (section 7).

### Log lines to look for

| Process | Line | Meaning |
|---|---|---|
| API | `Server listening at ...` | Up |
| API | `Redis connected` | Redis reachable |
| API | `AI provider initialised` with the intended provider | Provider chosen |
| API | `OCR provider initialised` with the intended provider name | Real OCR. `Using Mock OCR Provider` means `OCR_PROVIDER=mock` or the named provider's credentials are missing — image/scanned OCR is refused in production |
| Workers | `Workers started...` | Up |
| Either | `[AI] No API key for "..."` followed by `using MockAiProvider` | **Must NOT appear in production.** Every analysis would be canned sample data. Set the key for your `AI_PROVIDER` |

---

## 4. Running it

### Option A: Docker

Build from `backend/` (it has a `.dockerignore`). One image runs both processes; the workers override the command. Both containers must mount the same volume. The image runs as the non-root `node` user and sets `NODE_ENV=production`.

```bash
cd backend
docker build -t offerlens-backend .
docker volume create offerlens-uploads

docker run -d --name offerlens-api -p 8000:8000 \
  --env-file .env -v offerlens-uploads:/app/uploads offerlens-backend

docker run -d --name offerlens-workers \
  --env-file .env -v offerlens-uploads:/app/uploads offerlens-backend \
  node dist/src/workers/index.js
```

- `DATABASE_URL` and `REDIS_URL` must name hosts reachable from inside the container; `localhost` is the container itself.
- Use a named volume as above. A host bind mount such as `./uploads` may not be writable by the `node` user (untested here).
- For `OCR_PROVIDER=azure`, pass `AZURE_DOC_INTELLIGENCE_ENDPOINT`/`_KEY` to both containers (env vars, no file mount needed). For `OCR_PROVIDER=google`, mount `GOOGLE_CLOUD_CREDENTIALS` into both.
- The image has only `dist/`, production `node_modules` and `package.json`. Steps 5 to 8 of the checklist still run from a checkout.

### Option B: PM2

Run from `backend/` so `.env` is found (the config loads it from the working directory).

```bash
cd backend
npm ci && npm run build
npm install -g pm2
pm2 start dist/src/server.js --name offerlens-api
pm2 start dist/src/workers/index.js --name offerlens-workers
pm2 save
pm2 startup
```

### Local dependencies (not for production)

`backend/docker-compose.yml` starts Postgres 16 and Redis 7 for development only. It uses `postgres`/`postgres`, publishes `5432` and `6379` on all interfaces, and sets no Redis password. Never expose it to a network.

```bash
cd backend
docker compose up -d
```

(Docker Compose v2 spelling. The `version:` key in that file is obsolete and only prints a warning.)

---

## 5. Cookies, CORS and HTTPS

- A visitor's identity is a signed, `HttpOnly` guest cookie (`ol_guest`). It is `Secure` **only when `NODE_ENV=production`**, and `SameSite=Lax`.
- Serve both the frontend and the API over HTTPS. A `Secure` cookie is not stored over plain HTTP.
- The frontend and API must be **same-site** (for example `app.example.com` and `api.example.com`). On genuinely different registrable domains the browser will not send the cookie and guests break. Supporting that needs `sameSite: 'none'` in `middleware/guest-identifier.ts` (a code change, noted there).
- CORS allows exactly one origin, `CORS_ORIGIN`, with credentials. It must equal the site origin the browser sees. Allowed methods: `GET, POST, PUT, PATCH, DELETE, OPTIONS`.
- **OCR provider is chosen by `OCR_PROVIDER`** (`mock` | `google` | `azure`, default `mock`). Pasted text, `.txt` and text-layer PDFs never call OCR at all.
  - **`azure` (recommended, task 6.4).** Azure AI Document Intelligence `prebuilt-read` reads images **and scanned PDFs** in one integration (Cloud Vision rejects PDFs). Set `OCR_PROVIDER=azure` plus `AZURE_DOC_INTELLIGENCE_ENDPOINT` and `AZURE_DOC_INTELLIGENCE_KEY`. Deploy decisions: **S0** pay-as-you-go tier (no F0 2-page cap), region **Central India** (the endpoint URL encodes the region, so submitted documents stay in-region), and a **budget alert** set in the Azure portal (Cost Management → Budgets) since S0 has no hard spend cutoff. The key is a secret: keep it only in `.env.production` (chmod 600), never in git. Billing is per **page** (~$0.0015/page).
  - **`google`.** Cloud Vision, images only; needs `GOOGLE_CLOUD_CREDENTIALS` and Vision billing enabled, otherwise image uploads fail with "OCR extraction failed".
  - **Privacy / data egress.** With a real provider, uploaded offer letters (names, employers, salaries) are sent to that third party for recognition. Azure Read **transiently stores** the document + result in regional Azure Storage to run the async job, then returns the result; Central India keeps that copy in-region. This is new third-party egress (Cloud Vision implied the same). The app deletes its own **local** temp file after extraction; Azure's transient copy is Microsoft's and is removed per their retention policy. If UI copy ever promises the file is deleted, word it to mean the local temp file only.
- **Honest OCR without a real provider.** With `OCR_PROVIDER=mock` (or a real provider named but its credentials missing — the factory falls back to the mock with a loud warning), the OCR provider returns canned fixture text. In **production** an image or scanned-document OCR request is refused with a `400 OCR_UNAVAILABLE` ("Image uploads are not available on this deployment. Paste the text or upload a PDF with selectable text.") instead of a fabricated analysis — both on the synchronous `POST /offers/extract-file` route and inside the OCR worker (where it fails the offer with the same message and refunds the quota). Pasted text and text-layer PDFs are unaffected. Development and test keep the mock. The frontend upload page maps this code to a friendly inline notice. To accept images **and** scanned PDFs in production, set `OCR_PROVIDER=azure` with the two Azure vars.
- **Accepted upload types:** PDF, JPEG, PNG, plain text. `image/webp` was dropped (task 6.4) because Azure Read does not accept it.
- **Open item: AI provider falls back to the mock silently.** Unlike OCR, a missing key for the selected `AI_PROVIDER` still falls back to `MockAiProvider` with only a console warning (`ai.factory.ts`), so analyses are canned sample data rather than refused. There is no production guard on this. Confirm the logs do **not** contain `using MockAiProvider` (see the log-lines table in section 3) and set the key for your `AI_PROVIDER`.

---

## 6. Licence and data gates

Both datasets are optional. The app works without them.

| Gate | Condition before loading |
|---|---|
| Stack Overflow survey rows (`db:load-reference`, ODbL) | The dataset link shown beside every survey benchmark **resolves for an anonymous visitor**. It points at `https://offerlens.mueens.tech/datasets/so-2025-india/`; serve the `data/so-2025-india/` files at that path before loading the rows |
| PLFS city factors (`db:load-city-factors`) | The MoSPI e-mail (draft in the plan, "Phase 5 task 5.1b outcome") is sent **before the factors are loaded into any deployed instance that others can use**. Decision D1 (README rider) is recorded as decided by the owner. The data is non-commercial only. The PLFS dataset path (`https://offerlens.mueens.tech/datasets/plfs-city-factors/`) is served **only after that gate is passed**. Safe to skip |

**Dataset links (audit D9).** The links in `backend/src/modules/salary/reference-source.ts`,
`city-adjustment.ts` and `frontend/src/constants/attribution.ts` point at this deployment's own static host
(`https://offerlens.mueens.tech/datasets/...`), not the private `github.com/.../tree/main/data/...` URL,
which returns 404 to an anonymous visitor while the repo is private. The host is **hardcoded** in all four
constants (a `ponytail:` comment on each says so); to move it, change those four constants AND the nginx
`location /datasets/` block in `deploy/`. A drift test keeps the backend and frontend constants in sync.
Serve the ODbL dataset at `/datasets/so-2025-india/` before loading the reference rows; serve the PLFS
dataset at `/datasets/plfs-city-factors/` only after the MoSPI e-mail gate is passed.

PLFS rollback: `DELETE FROM city_pay_factors;` makes every city serve the unchanged national figures at once, with no deploy or cache flush.
The raw PLFS files never go on a server and never enter the repository.

---

## 7. Operations notes

**`TRUST_PROXY`.** Behind a reverse proxy or platform load balancer every client otherwise looks like the
proxy's IP. Set the `TRUST_PROXY` environment variable to the number of trusted proxy hops in front of the
API (0-5). With this guide's single host nginx that is `1`:

```
TRUST_PROXY=1
```

`0` (the default) is off: `request.ip` is the socket address and `X-Forwarded-For` is ignored. A positive
count makes Fastify trust that many `X-Forwarded-For` entries from the right, so `request.ip` becomes the
real client. The proxy must overwrite `X-Forwarded-For`, not append to a client-supplied one. No code edit
or rebuild is needed; it is read at boot.
Without it: cookie-less clients share one 100/min bucket, and the login IP limit (30 per 15 minutes) becomes site-wide.

**Swagger UI** is served at `/api/v1/docs` with no production gate and its `servers` entry says `http://localhost:8000`.
Block the path at the proxy if you do not want it public.

**Plans and quotas.** New users are on the `free` plan (3 analyses a day). Daily limits reset at 00:00 IST, not on a rolling 24 hours.
Change a plan with SQL: `UPDATE users SET plan = 'unlimited' WHERE email = '...';` (see `LOCAL_DEVELOPMENT.md` section 4.1).

**Service-account key.** A Cloud Vision key was committed earlier and is still in git history (plan follow-up F1). Issue a new key
for the deployment; revoke the old one if you cannot confirm it was rotated.

---

## 8. Troubleshooting

- **Database connection**: check `DATABASE_URL` and that the database is up.
- **Redis connection**: check `REDIS_URL` is reachable. The API refuses to boot without it.
- **Permissions**: the `STORAGE_PATH` directory must be writable by the process user, in both processes.
- **Uploads stay `QUEUED`**: the workers are not running, or they cannot see the same `STORAGE_PATH`.
- **Server exits on boot**: read the "Invalid environment variables" line; usually a missing or short secret, or a blank `COOKIE_SECRET`.
- **Rate limiting (needs Redis)**: limits are stored in Redis, so they hold across API processes, and the limiter fails closed (`skipOnError` is off), so an unreachable Redis should make requests error rather than skip the limit (from reading the plugin source, not tested). Browsers are counted per `ol_guest` cookie, signed-in users per account. Requests without a valid cookie (scripts, health checks) are counted per client IP. See `trustProxy` above. All limits are listed in `api-spec.md`.
  - **Login limits (pre-deploy requirement).** `POST /auth/login` also has a per-IP limit (30 per 15 minutes, counted on the client IP whatever the cookie) and a per-email limit (10 per 15 minutes, attempts since the last successful login; the address is sha256-hashed in Redis and never logged). **Set `TRUST_PROXY` before enabling the login IP limit; otherwise the whole site shares 30 logins per 15 minutes.** This hits browsers too, because the login IP limit ignores cookies. The email counter needs Redis 7 (`PEXPIRE ... NX`; `docker-compose.yml` pins `redis:7-alpine`) and fails closed, so a Redis fault is a 500 on login rather than an open gate. `POST /auth/google` has no email and is covered only by the per-cookie limit. To clear limits in Redis, scan both `fastify-rate-limit-*` and `login-email:*`.
