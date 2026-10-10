import { describe, it, expect } from "vitest";
import {
  formatIstTime,
  getQuotaError,
  isRateLimited,
  isUploadBlocked,
  quotaExhaustedText,
  quotaRemainingText,
  type QuotaErrorDetails,
} from "./quota";

const RESET = "2026-10-10T18:30:00.000Z"; // 00:00 IST on 11 Oct
const norm = (s: string) => s.replace(/\s/g, " ");

const err429 = (code: string, details?: unknown) => ({
  response: { status: 429, data: { error: { code, details } } },
});

describe("formatIstTime", () => {
  it("formats the reset instant as IST wall-clock", () => {
    expect(norm(formatIstTime(RESET))).toMatch(/^12:00 am IST$/i);
  });
});

describe("getQuotaError / isRateLimited", () => {
  const details: QuotaErrorDetails = { feature: "analysis", limit: 1, used: 1, remaining: 0, resetAt: RESET, plan: "guest" };

  it("returns details for UPLOAD_LIMIT_EXCEEDED and QUOTA_EXCEEDED", () => {
    expect(getQuotaError(err429("UPLOAD_LIMIT_EXCEEDED", details))).toEqual(details);
    expect(getQuotaError(err429("QUOTA_EXCEEDED", { ...details, feature: "career" }))?.feature).toBe("career");
  });

  it("is null for a rate limit or a non-429", () => {
    expect(getQuotaError(err429("RATE_LIMIT_EXCEEDED"))).toBeNull();
    expect(getQuotaError({ response: { status: 400, data: { error: { code: "QUOTA_EXCEEDED" } } } })).toBeNull();
    expect(getQuotaError(new Error("network"))).toBeNull();
  });

  it("isRateLimited only for RATE_LIMIT_EXCEEDED", () => {
    expect(isRateLimited(err429("RATE_LIMIT_EXCEEDED"))).toBe(true);
    expect(isRateLimited(err429("UPLOAD_LIMIT_EXCEEDED"))).toBe(false);
  });
});

describe("copy", () => {
  it("remaining", () => {
    expect(quotaRemainingText({ limit: 3, used: 1, remaining: 2 })).toBe("2 of 3 analyses left today");
    expect(quotaRemainingText({ limit: 1, used: 0, remaining: 1 })).toBe("1 of 1 analysis left today");
    expect(quotaRemainingText({ limit: null, used: 5, remaining: null })).toBe("");
  });

  it("guest exhausted", () => {
    const text = norm(quotaExhaustedText({ feature: "analysis", limit: 1, used: 1, remaining: 0, resetAt: RESET, plan: "guest" }, 3));
    expect(text).toContain("today's free analysis");
    expect(text).toContain("IST");
    expect(text).toContain("3 analyses a day");
  });

  it("registered exhausted", () => {
    const text = quotaExhaustedText({ feature: "analysis", limit: 3, used: 3, remaining: 0, resetAt: RESET, plan: "free" });
    expect(text).toContain("all 3 analyses today");
    expect(text).toContain("IST");
    expect(text).not.toMatch(/account|unlimited/i);
  });

  it("feature cap", () => {
    const text = quotaExhaustedText({ feature: "career", limit: 10, used: 10, remaining: 0, resetAt: RESET, plan: "free" });
    expect(text).toContain("today's limit of 10 career paths");
  });
});

describe("isUploadBlocked", () => {
  const snap = (remaining: number | null) => ({
    plan: "free" as const, day: "2026-10-10", resetAt: RESET, accountAnalysesPerDay: 3,
    quotas: {
      analysis: { limit: remaining === null ? null : 3, used: 0, remaining },
      autofill: { limit: 30, used: 0, remaining: 30 },
      career: { limit: 10, used: 0, remaining: 10 },
      negotiation: { limit: 10, used: 0, remaining: 10 },
    },
  });

  it("only when remaining is exactly 0", () => {
    expect(isUploadBlocked(snap(0))).toBe(true);
    expect(isUploadBlocked(snap(1))).toBe(false);
    expect(isUploadBlocked(snap(null))).toBe(false);
    expect(isUploadBlocked(undefined)).toBe(false);
  });
});
