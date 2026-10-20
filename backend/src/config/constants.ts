// image/webp was dropped in task 6.4: Azure AI Document Intelligence Read does not accept webp
// (pdf, tiff, jpeg, png, bmp, heif only), and we do not convert it. Stop accepting it at the door
// so the API and UI agree rather than letting a webp reach the provider and be rejected there.
export const SUPPORTED_FILE_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'text/plain',
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const GUEST_TTL_HOURS = 24;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const ANALYSIS_TIMEOUT_MS = 60_000; // 60s

/**
 * How long an offer may sit unfinished before the reaper declares it dead (task 21a).
 *
 * Deliberately NOT `ANALYSIS_TIMEOUT_MS` itself, which is what the plan suggested reusing.
 * That is the budget for one analysis call. A single upload can legitimately spend longer
 * than it end to end: queue wait, then OCR, then an analysis that walks the whole model
 * fallback chain after a 503. Reaping at 60s would cancel work that was still going to
 * succeed, which is a worse failure than the one being fixed.
 *
 * Expressed as a multiple so the two stay related — if the per-call budget moves, this does.
 *
 * ponytail: the window is measured from createdAt and covers every BullMQ retry (attempts: 3
 * on both queues, backoff 1s+2s OCR, 2s+4s analysis). Retries now stay PROCESSING (FLOW-2), so
 * they are reapable. Typical runs fit easily: 3 analysis attempts of 15-30s plus 6s backoff.
 * Ceiling: the worst case does not fit. Three Azure OCR polls at their 110s bound already take
 * 333s, and nothing enforces ANALYSIS_TIMEOUT_MS on an AI call, so one ~3 min Gemini attempt
 * plus a retry also overruns. Such an offer is reaped (FAILED + refund) while a retry is still
 * running. That retry may still write COMPLETED (see the analysis worker's COMPLETED write), and
 * a later analysis attempt's PROCESSING write can briefly un-fail it until the next sweep.
 * Refunds stay exactly-once (releaseOfferQuota claims). Not widened here: ProcessingPage also
 * gives up at 5 min, so this is a user-facing timeout. Upgrade path: enforce a per-attempt
 * budget so attempts x budget + backoff < this window, or reap by a per-attempt heartbeat
 * column instead of createdAt.
 */
export const STUCK_OFFER_TIMEOUT_MS = 5 * ANALYSIS_TIMEOUT_MS; // 5 min

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d in ms
export const REFRESH_TOKEN_EXPIRY = '7d';

/**
 * Below this, text recognition is treated as unreliable — but the analysis still runs.
 *
 * It used to mean "reject the upload": the OCR worker set the offer to FAILED with
 * `Low OCR confidence: 0.55`. That is the wrong trade for a photographed offer letter. A
 * slightly blurry scan still yields a mostly-correct letter, and the confidence machinery from
 * task 11 already downgrades every field read from a page and shows the user a caveat, so the
 * honest outcome is an analysis carrying a warning rather than a dead end with no result and no
 * way to proceed except taking a better photo.
 *
 * A null confidence is NOT low confidence. See `deriveConfidence`.
 */
export const OCR_MIN_CONFIDENCE = 0.6; // 60%

/**
 * Below this many characters, there is nothing to analyse.
 *
 * Previously unchecked, and only caught by accident: empty OCR output came with confidence 0,
 * which tripped the confidence gate. Removing that gate needs this in its place, and it is the
 * more honest failure anyway — "we could not read any text" rather than "confidence 0".
 *
 * Deliberately low. It exists to catch a blank page or a photograph of a wall, not to judge how
 * terse a letter is; the shortest corpus letter is over 700 characters.
 */
export const MIN_EXTRACTED_TEXT_CHARS = 80;

// Upper bound on text sent to POST /offers/extract. Gemini cost scales with input length,
// and the provider truncates to 10k anyway — better to reject loudly than analyse a
// fraction of a huge paste and return confident nonsense.
export const MAX_EXTRACT_TEXT_CHARS = 100_000;

export const QUEUE_RETRY_ATTEMPTS = 3;
export const QUEUE_RETRY_BACKOFF_MS = 1_000; // 1s base, exponential

// Guest identity cookie (ADR-001). Replaced the fingerprint + IP scheme, along with
// the SPOOFING_THRESHOLD / SPOOFING_WINDOW_MS constants that supported it — a
// server-signed cookie leaves nothing for a client to forge.
export const GUEST_COOKIE_NAME = 'ol_guest';
export const GUEST_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60; // 30 days

/**
 * How long a generated career path is cached per offer (task 4.3). Long, because the inputs
 * only change when the user corrects the extracted data, and that invalidates the entry.
 */
export const CAREER_PATH_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days

// Daily analysis and feature quotas are NOT here: they live in config/plans.ts and are
// enforced by quota_counters. These are per-window request rate limits only.
//
// Only entries applied with `routeLimit('<name>')` are enforced; everything else shares the
// `global` bucket. Wired: offerExtractText, offerExtractFile, accountExport, authSignup, authLogin,
// negotiate, compare, benefits, salaryStats (plus authLoginIp and authLoginEmail through
// `createLoginGuard`, not `routeLimit`). NOT wired (no route uses them, so they do nothing):
// offerPolling, analysisGet, offerDelete, reportGet, metadata, featureRequestCreate,
// featureRequestVote, corrections. Wiring offerPolling would be a mistake as written: 60/min
// leaves little room over a 1 s poll loop (those routes ride the 100/min global instead).
export const RATE_LIMITS = {
    // Both call paid third-party APIs (Gemini and Cloud Vision) and are reachable without
    // an account, so they are the cheapest way to run up someone else's bill. Tight (C2).
    offerExtractText: { max: 20, window: '1 hour' },
    offerExtractFile: { max: 10, window: '1 hour' },
    offerPolling: { max: 60, window: '1 minute' },
    analysisGet: { max: 30, window: '1 minute' },
    offerDelete: { max: 10, window: '1 minute' },
    accountExport: { max: 5, window: '1 hour' },
    reportGet: { max: 10, window: '1 minute' },
    metadata: { max: 30, window: '1 minute' },
    // Public, unauthenticated Salary Explorer read; a cold call can now run up to 3 indexed queries.
    salaryStats: { max: 30, window: '1 minute' },
    featureRequestCreate: { max: 5, window: '1 hour' },
    featureRequestVote: { max: 30, window: '1 minute' },
    authSignup: { max: 5, window: '1 hour' },
    // POST /auth/login and /auth/google: per browser cookie (per IP when the request has no cookie).
    authLogin: { max: 10, window: '15 minutes' },
    // POST /auth/login ONLY, enforced by `createLoginGuard` (not `routeLimit`): per client IP (30), and
    // per normalised email, any cookie or IP (10; attempts since the last successful login). /auth/google
    // has no email in its body, so neither applies there. `windowMs` is the same window as a number.
    authLoginIp: { max: 30, window: '15 minutes', windowMs: 15 * 60 * 1000 },
    authLoginEmail: { max: 10, window: '15 minutes', windowMs: 15 * 60 * 1000 },
    negotiate: { max: 10, window: '1 hour' },
    compare: { max: 20, window: '1 hour' },
    corrections: { max: 20, window: '1 hour' },
    // Pure calculation, no AI call. 20 -> 60 in 5.4 (owner-approved): the drawer's open-time fetch
    // plus each "Recalculate" costs one request.
    benefits: { max: 60, window: '1 hour' },
    global: { max: 100, window: '1 minute' },
} as const;

export const APP_VERSION = '1.0.0';

// Ordered by preference — used for auto-fallback on transient model errors
// (429 rate limit, 503 overloaded, 500 internal).
//
// Last verified live 2026-10-15 against a ListModels call on a fresh API key.
// gemini-2.5-flash is DEAD for new keys — it 404s on generateContent — and was removed
// entirely; a key issued today never resolves it, so a baked-in default of 2.5-flash
// failed every analysis until GEMINI_MODEL was set by hand. The current flash line
// (3.5/3.6/3.7/3.8) plus the moving `-latest` aliases are what the key can actually serve.
//   gemini-2.0-flash / gemini-2.0-flash-lite — never existed in ListModels
//   gemini-2.5-flash / gemini-2.5-flash-lite — gone for new keys
//
// Keep this list verified. A dead entry silently shortens the fallback chain.
export const GEMINI_FALLBACK_MODELS = [
    'gemini-3.5-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
] as const;

/**
 * Default model when the caller doesn't pick one.
 *
 * `gemini-3.5-flash` is a pinned, owner-chosen version confirmed available to a fresh key.
 * The moving `-latest` aliases stay in the fallback chain above as a safety net when the
 * pinned model is briefly overloaded. A fresh key now works WITHOUT the GEMINI_MODEL
 * override — it only had to be set because the old default (gemini-2.5-flash) was dead.
 *
 * Previously this string was duplicated across 8 call sites in routes, services and
 * both workers.
 */
export const DEFAULT_GEMINI_MODEL: string = GEMINI_FALLBACK_MODELS[0];

/**
 * Cheapest Gemini model, used for metadata/autofill extraction (five fields, no need for
 * the strongest). `gemini-flash-lite-latest` is a moving alias confirmed on the live key.
 */
export const GEMINI_LITE_MODEL = 'gemini-flash-lite-latest';

/**
 * OpenAI models, best first, cheapest last.
 *
 * The last entry is deliberately the cheapest: `modelFor('metadata')` picks it, because
 * autofill extracts five fields and does not need a strong model.
 *
 * `gpt-4.1-mini` is the default because it supports strict `json_schema` structured output,
 * which is the mechanism this codebase depends on. A model without it would silently fall
 * back to loose JSON and reintroduce the shape-drift problem Phase 1 fixed.
 *
 * NOT verified against a live key — no OpenAI credentials were available when this was
 * written. Check the ids before relying on them, and override with OPENAI_MODEL if needed.
 */
export const OPENAI_FALLBACK_MODELS = [
    'gpt-4.1-mini',
    'gpt-4.1',
    'gpt-4o-mini',
] as const;

export const DEFAULT_OPENAI_MODEL: string = OPENAI_FALLBACK_MODELS[0];

/**
 * Anthropic models, best first, cheapest last.
 *
 * Structured output goes through forced tool use rather than a JSON mode, which every
 * current Claude model supports.
 *
 * NOT verified against a live key. Anthropic also ships dated ids
 * (`claude-haiku-4-5-20251001`); the pricing table matches those by prefix, so either form
 * is costed correctly. Override with ANTHROPIC_MODEL.
 */
export const ANTHROPIC_FALLBACK_MODELS = [
    'claude-sonnet-4-5',
    'claude-haiku-4-5',
] as const;

export const DEFAULT_ANTHROPIC_MODEL: string = ANTHROPIC_FALLBACK_MODELS[0];

/** Providers the factory can build. `mock` needs no key and returns fixed data. */
export const AI_PROVIDERS = ['gemini', 'openai', 'anthropic', 'mock'] as const;
