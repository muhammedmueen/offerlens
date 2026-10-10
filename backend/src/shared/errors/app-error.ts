import type { QuotaFeature, TierId } from '@/config/plans.js';
import { retryAfterSeconds } from '@/shared/ist-day.js';
import { ERROR_CODES } from './error-codes.js';

export class AppError extends Error {
    public readonly code: string;
    public readonly statusCode: number;
    public readonly details?: unknown;

    constructor(code: string, message: string, statusCode = 500, details?: unknown) {
        super(message);
        this.code = code;
        this.statusCode = statusCode;
        this.details = details;
        this.name = this.constructor.name;
        Error.captureStackTrace(this, this.constructor);
    }
}

export interface QuotaExceededDetails {
    feature: QuotaFeature;
    limit: number;
    used: number;
    remaining: 0;
    resetAt: string;
    plan: TierId;
}

/**
 * A daily quota is used up (tasks 4.3/4.4). 429 with the numbers the UI needs to be honest,
 * and a `retryAfterSeconds` the error handler turns into a Retry-After header.
 *
 * Analyses keep `UPLOAD_LIMIT_EXCEEDED`; the per-feature caps use `QUOTA_EXCEEDED`. Both are
 * distinct from the plugin's `RATE_LIMIT_EXCEEDED`, so a client can tell "you're out for the
 * day" from "slow down".
 */
export class QuotaExceededError extends AppError {
    public readonly retryAfterSeconds: number;
    declare public readonly details: QuotaExceededDetails;

    constructor(args: { feature: QuotaFeature; limit: number; used: number; tierId: TierId; resetAt: Date; now: Date }) {
        const { feature, limit, used, tierId, resetAt, now } = args;
        super(
            feature === 'analysis' ? ERROR_CODES.UPLOAD_LIMIT_EXCEEDED : ERROR_CODES.QUOTA_EXCEEDED,
            `Daily ${feature} limit reached (${limit} per day). Resets at 00:00 IST.`,
            429,
            { feature, limit, used, remaining: 0, resetAt: resetAt.toISOString(), plan: tierId } satisfies QuotaExceededDetails,
        );
        this.retryAfterSeconds = retryAfterSeconds(resetAt, now);
    }
}
