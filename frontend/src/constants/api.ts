// Default must match the backend's PORT default (8000, see backend/src/config/env.schema.ts).
// This pointed at 5000, so a fresh checkout failed every request until VITE_API_BASE_URL
// was set by hand.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

export const ENDPOINTS = {
  // Auth
  AUTH_SIGNUP: "/auth/signup",
  AUTH_LOGIN: "/auth/login",
  AUTH_GOOGLE: "/auth/google",
  AUTH_REFRESH: "/auth/refresh",
  AUTH_LOGOUT: "/auth/logout",

  // User
  USER_ME: "/users/me",
  USER_OFFERS: "/users/me/offers",
  USER_DASHBOARD: "/users/me/dashboard",

  // Offers
  OFFERS: "/offers",
  OFFER: (id: string) => `/offers/${id}`,
  OFFER_ANALYSIS: (id: string) => `/offers/${id}/analysis`,
  OFFER_REPORT: (id: string) => `/offers/${id}/report`,
  OFFER_NEGOTIATE: (id: string) => `/offers/${id}/negotiate`,
  OFFER_BENEFITS: (id: string) => `/offers/${id}/benefits`,
  OFFER_EXTRACT: "/offers/extract",
  OFFER_EXTRACT_FILE: "/offers/extract-file",
  OFFER_CAREER_PATH: (id: string) => `/offers/${id}/career-path`,
  OFFER_CORRECTIONS: (id: string) => `/offers/${id}/corrections`,
  OFFERS_COMPARE: "/offers/compare",

  // Salaries
  SALARIES: "/salaries",
  SALARIES_STATS: "/salaries/stats",

  // Metadata
  METADATA_ROLES: "/metadata/roles",
  METADATA_CITIES: "/metadata/cities",
  METADATA_EXPERIENCE_LEVELS: "/metadata/experience-levels",

  // Forum
  FORUM_POSTS: "/forum/posts",
  FORUM_POST: (id: string) => `/forum/posts/${id}`,
  FORUM_POST_COMMENTS: (id: string) => `/forum/posts/${id}/comments`,

  // Feature Requests
  FEATURE_REQUESTS: "/feature-requests",
  FEATURE_REQUEST_VOTE: (id: string) => `/feature-requests/${id}/vote`,

  // Health
  HEALTH: "/health",
} as const;

export const GUEST_RATE_LIMIT = 3;
export const GUEST_TTL_HOURS = 24;
export const POLLING_INTERVAL_MS = 3000;
export const ITEMS_PER_PAGE = 20;

// Mirrors SUPPORTED_FILE_TYPES in the backend, including text/plain — pdf-extractor.ts
// already handles it, but it was missing here so .txt was rejected before upload.
export const ACCEPTED_FILE_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];
export const MAX_FILE_SIZE_MB = 10;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// EXPERIENCE_LEVELS removed. It hardcoded 8 labels ("Entry Level", "Mid Level", …) that
// disagreed with both the DB seed and the AI extraction prompt, which use 6 banded labels
// ("Fresher (0-1 yrs)", …). Nothing imported it — the upload form already reads the real
// list from GET /metadata/experience-levels. Fetch that rather than reintroducing a copy.

export const OFFER_STATUS = {
  QUEUED: "QUEUED",
  PROCESSING: "PROCESSING",
  COMPLETED: "COMPLETED",
  FAILED: "FAILED",
} as const;
