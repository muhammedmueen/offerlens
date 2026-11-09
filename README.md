# OfferLens

AI-powered offer letter analysis: upload a job offer (PDF/image), get a 0-100 score, red-flag detection, salary benchmarking, negotiation scripts, and benefits breakdown.

> **Status: personal/portfolio project**, deployed to validate the idea, not a SaaS. Pricing/plans shown in the UI are display-only — no payments are processed. (Decision recorded 2026-10-11, see [`docs/PLAN-analysis-pipeline.md`](docs/PLAN-analysis-pipeline.md).)

## Tech stack

| Layer | Stack |
|---|---|
| Frontend | React 18, TypeScript, Vite, Tailwind CSS, shadcn/ui, TanStack Query |
| Backend | Node.js 22, Fastify 5, Drizzle ORM, PostgreSQL, Redis, BullMQ |
| AI / OCR | Gemini (default) / OpenAI / Anthropic for analysis; Azure Document Intelligence or Google Cloud Vision for OCR; pdf.js for client-side text extraction |

## Monorepo layout

```
frontend/   React app (Vite dev server, port 8080)
backend/    Fastify API + BullMQ workers (port 8000)
deploy/     Production docker-compose, nginx config, deploy scripts
docs/       Architecture, API spec, roadmap, deployment, known bugs
```

## Getting started

Prerequisites: Node.js 22.13+, npm, Docker (for Postgres + Redis).

```bash
# Backend
cd backend
cp .env.example .env        # fill in JWT_SECRET / JWT_REFRESH_SECRET at minimum
docker compose up -d        # Postgres + Redis
npm install
npm run db:migrate
npm run dev                 # API on :8000
npm run workers             # separate terminal: BullMQ workers

# Frontend
cd frontend
npm install
npm run dev                 # app on :8080
```

The frontend calls the backend directly at `http://localhost:8000/api/v1` (no dev proxy) — `CORS_ORIGIN` on the backend must match the frontend's origin. See [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) and [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for details, [`docs/DEPLOY_VPS.md`](docs/DEPLOY_VPS.md) for a VPS walkthrough.

## Features

### Shipped and working
- **Offer upload & OCR** — PDF/image upload; text-based PDFs extracted client-side (pdf.js); scanned PDFs/images fall back to Azure Document Intelligence or Google Cloud Vision.
- **AI analysis pipeline** — extracted offer data, red flags (hallucination-guarded against the source text), salary comparison, negotiation suggestions, take-home pay.
- **Offer scoring (0-100)** — weighted rubric (salary vs. market, red flags, benefits, growth), with a deterministic fallback when AI scoring is unavailable.
- **Async processing** — upload returns immediately; a BullMQ worker processes in the background; frontend polls status.
- **Guest users** — analyze without an account via a signed guest cookie, 3/day limit, 24h TTL, migrates to a real account on signup.
- **Accounts & history** — email/password and Google OAuth login, dashboard of past offers.
- **Negotiation script generator** — AI-drafted email with a template fallback when data is thin; never charges quota for a failed/invalid generation.
- **Benefits calculator** — PTO, insurance, equity, etc. quantified into total compensation, with user-editable overrides.
- **PDF report export** — styled report with score, red flags, salary comparison, negotiation tips (Unicode-safe, embedded fonts).
- **Offer comparison** — side-by-side comparison of 2-3 offers.
- **RLHF corrections** — users can correct extracted fields; corrections are applied and recomputed through score/take-home, not just stored.
- **Salary crowdsourcing & career path insights** — submission/browse endpoints and a career-trajectory panel.
- **Rate limiting** — per-route limits plus a global cap; guest uploads capped separately.

### Known gaps / in progress
See [`docs/KNOWN-BUGS.md`](docs/KNOWN-BUGS.md) (actively maintained bug tracker) and [`docs/roadmap.md`](docs/roadmap.md) (feature backlog with MoSCoW prioritization) for the full, current list. Highlights as of the last update (2026-10-18):
- **Forum** and **content moderation** (profanity/spam filtering on feature requests, forum posts, salary submissions) are not implemented.
- **Payments / Job Hunt Pass** are parked indefinitely — nothing is charged for; see status note above.
- **Admin/superadmin tooling** is deferred; the one operator uses `psql` directly.
- No real-browser or real-Postgres verification for some recent fixes (noted per-item in `docs/KNOWN-BUGS.md`); never deployed with real user data as of the last status update.
- A handful of open bugs remain, ranked Major/Medium/Minor in `docs/KNOWN-BUGS.md`'s "Open bugs" section (benefits-panel edge cases are flagged as the least trustworthy numbers in the app).

## Testing

```bash
# Backend (from backend/)
npm test            # vitest

# Frontend (from frontend/)
npm test            # vitest (unit)
npm run test:e2e    # playwright
```

As of the last recorded run: backend ~1200 tests passing (3 skipped, Postgres-only), frontend 27 test files / 264+ tests passing. See `docs/KNOWN-BUGS.md` §1 for the exact commit this was measured against — re-check before relying on it.

## Documentation

| Doc | Covers |
|---|---|
| [`docs/roadmap.md`](docs/roadmap.md) | Product intent, MoSCoW feature map, milestone plan, per-milestone Definition of Done |
| [`docs/PLAN-analysis-pipeline.md`](docs/PLAN-analysis-pipeline.md) | Analysis pipeline history, decisions (ADRs), current priority order |
| [`docs/KNOWN-BUGS.md`](docs/KNOWN-BUGS.md) | Single source of truth for bug status — fixed and open, with evidence |
| [`docs/api-spec.md`](docs/api-spec.md) / [`docs/API_DOCUMENTATION.md`](docs/API_DOCUMENTATION.md) | API reference |
| [`docs/database-design.md`](docs/database-design.md) | Schema design |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) / [`docs/DEPLOY_VPS.md`](docs/DEPLOY_VPS.md) | Production deployment |
| [`docs/LOCAL_DEVELOPMENT.md`](docs/LOCAL_DEVELOPMENT.md) | Local dev setup |
| [`docs/monetization.md`](docs/monetization.md) | Pricing/plans design (display-only, see status note) |

## License

MIT — see [`LICENSE`](LICENSE).
