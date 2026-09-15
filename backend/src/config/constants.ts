export const SUPPORTED_FILE_TYPES = [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'text/plain',
] as const;

export const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024; // 10MB

export const GUEST_TTL_HOURS = 24;

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 50;

export const ANALYSIS_TIMEOUT_MS = 60_000; // 60s

export const ACCESS_TOKEN_EXPIRY = '15m';
export const REFRESH_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7d in ms
export const REFRESH_TOKEN_EXPIRY = '7d';

export const OCR_MIN_CONFIDENCE = 0.6; // 60%

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

export const RATE_LIMITS = {
    guestUpload: { max: 3, window: '1 day' },
    // Both call paid third-party APIs (Gemini and Cloud Vision) and are reachable without
    // an account, so they are the cheapest way to run up someone else's bill. Tight (C2).
    offerExtractText: { max: 20, window: '1 hour' },
    offerExtractFile: { max: 10, window: '1 hour' },
    offerPolling: { max: 60, window: '1 minute' },
    analysisGet: { max: 30, window: '1 minute' },
    offerDelete: { max: 10, window: '1 minute' },
    reportGet: { max: 10, window: '1 minute' },
    metadata: { max: 30, window: '1 minute' },
    featureRequestCreate: { max: 5, window: '1 hour' },
    featureRequestVote: { max: 30, window: '1 minute' },
    authSignup: { max: 5, window: '1 hour' },
    authLogin: { max: 10, window: '15 minutes' },
    negotiate: { max: 10, window: '1 hour' },
    compare: { max: 20, window: '1 hour' },
    corrections: { max: 20, window: '1 hour' },
    benefits: { max: 20, window: '1 hour' },
    global: { max: 100, window: '1 minute' },
} as const;

export const APP_VERSION = '1.0.0';

// Ordered by preference — used for auto-fallback on transient model errors
// (429 rate limit, 503 overloaded, 500 internal).
//
// Verified live 2026-09-09 against the ListModels API and real generateContent calls.
// Removed as unusable:
//   gemini-2.0-flash        — not present in ListModels
//   gemini-2.0-flash-lite   — not present in ListModels
//   gemini-2.5-flash-lite   — listed by ListModels but 404s on generateContent
//
// Keep this list verified. A dead entry silently shortens the fallback chain.
export const GEMINI_FALLBACK_MODELS = [
    'gemini-2.5-flash',
    'gemini-flash-latest',
    'gemini-flash-lite-latest',
] as const;

/**
 * Default model when the caller doesn't pick one.
 *
 * Was `gemini-flash-latest`, which is a moving alias and was returning 503 when this
 * was checked. `gemini-2.5-flash` is a pinned version that answered reliably, so it is
 * a better default; the alias stays in the fallback chain above.
 *
 * Previously this string was duplicated across 8 call sites in routes, services and
 * both workers.
 */
export const DEFAULT_GEMINI_MODEL: string = GEMINI_FALLBACK_MODELS[0];
