/**
 * Daily quotas, as the API reports them (tasks 4.3/4.4).
 *
 * Every number shown to the user comes from GET /quota or from a 429's `details`. Nothing here
 * hard-codes a limit, so changing a plan on the backend changes the copy too.
 */

export type QuotaFeature = "analysis" | "autofill" | "career" | "negotiation";
export type QuotaPlan = "guest" | "free" | "unlimited";

export interface QuotaLine {
  /** null = unlimited */
  limit: number | null;
  used: number;
  /** null = unlimited */
  remaining: number | null;
}

export interface QuotaSnapshot {
  plan: QuotaPlan;
  day: string;
  resetAt: string;
  quotas: Record<QuotaFeature, QuotaLine>;
  /** What a free account gets per day, for the guest sign-up nudge. */
  accountAnalysesPerDay: number;
}

/** `error.details` on a 429 UPLOAD_LIMIT_EXCEEDED / QUOTA_EXCEEDED. */
export interface QuotaErrorDetails {
  feature: QuotaFeature;
  limit: number;
  used: number;
  remaining: number;
  resetAt: string;
  plan: QuotaPlan;
}

const QUOTA_CODES = new Set(["UPLOAD_LIMIT_EXCEEDED", "QUOTA_EXCEEDED"]);

interface ApiErrorLike {
  response?: { status?: number; data?: { error?: { code?: string; details?: unknown } } };
}

/** The quota details of a daily-limit 429, or null for anything else (incl. a rate limit). */
export function getQuotaError(err: unknown): QuotaErrorDetails | null {
  const res = (err as ApiErrorLike)?.response;
  const code = res?.data?.error?.code;
  if (res?.status !== 429 || !code || !QUOTA_CODES.has(code)) return null;
  return (res.data?.error?.details as QuotaErrorDetails) ?? null;
}

/** A plain "slow down" 429 from the rate limiter, not a daily quota. */
export function isRateLimited(err: unknown): boolean {
  const res = (err as ApiErrorLike)?.response;
  return res?.status === 429 && res.data?.error?.code === "RATE_LIMIT_EXCEEDED";
}

/** Id of the exhausted-quota notice, for `aria-describedby` on the disabled upload button. */
export const QUOTA_NOTICE_ID = "quota-notice";

/** Whether today's analysis allowance is used up. Unlimited or unknown is never blocked. */
export function isUploadBlocked(quota: QuotaSnapshot | undefined): boolean {
  return quota?.quotas.analysis.remaining === 0;
}

export const RATE_LIMITED_TEXT = "Too many requests. Please wait a minute and try again.";

/** Login and signup windows are 15 minutes and 1 hour, so no "a minute" here. */
export const RATE_LIMITED_AUTH_TEXT = "Too many attempts. Please wait a while before trying again.";

const istTime = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

/** "12:00 am IST". Quotas reset at 00:00 IST. */
export function formatIstTime(iso: string): string {
  return `${istTime.format(new Date(iso))} IST`;
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "2 of 3 analyses left today". Empty for unlimited. */
export function quotaRemainingText(q: QuotaLine): string {
  if (q.limit === null || q.remaining === null) return "";
  return `${q.remaining} of ${q.limit} ${plural(q.limit, "analysis", "analyses")} left today`;
}

const FEATURE_NOUNS: Record<Exclude<QuotaFeature, "analysis">, [string, string]> = {
  career: ["career path", "career paths"],
  negotiation: ["negotiation script", "negotiation scripts"],
  autofill: ["autofill", "autofills"],
};

/** What to tell someone who has used up a daily allowance. */
export function quotaExhaustedText(details: QuotaErrorDetails, accountAnalysesPerDay?: number): string {
  const time = formatIstTime(details.resetAt);

  if (details.feature === "analysis") {
    if (details.plan === "guest") {
      const nudge = accountAnalysesPerDay
        ? ` Create a free account to get ${accountAnalysesPerDay} ${plural(accountAnalysesPerDay, "analysis", "analyses")} a day.`
        : "";
      return `You've used today's free analysis. It resets at ${time}.${nudge}`;
    }
    return `You've used all ${details.limit} ${plural(details.limit, "analysis", "analyses")} today. They reset at ${time}.`;
  }

  const [one, many] = FEATURE_NOUNS[details.feature];
  return `You've reached today's limit of ${details.limit} ${plural(details.limit, one, many)}. It resets at ${time}.`;
}
