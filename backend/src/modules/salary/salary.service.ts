import { db } from '@/db/index.js';
import { salarySubmissions } from '@/db/schema/salary-submissions.js';
import { createHash } from 'node:crypto';
import { eq, and } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { cached, cacheDelete, getRedis } from '@/shared/cache.js';

/**
 * Minimum approved submissions before a role+city combination is reported as real data.
 *
 * The plan proposes raising this to 10 for noise resistance (Phase 4). Left at 5 for now
 * so the change is one number in one place rather than scattered comparisons.
 */
export const MIN_SAMPLE_SIZE = 5;

/**
 * Where `value` sits within `sorted`, as a 0-100 percentile rank.
 *
 * Uses the midpoint convention: values equal to the offer count as half below. That
 * avoids reporting the 0th percentile for an offer that exactly matches the lowest
 * submission, which reads as far more damning than the data supports.
 *
 * Pure and exported so it can be tested without a database.
 */
export function percentileRank(sorted: number[], value: number): number {
    if (sorted.length === 0) return 50;

    let below = 0;
    let equal = 0;
    for (const v of sorted) {
        if (v < value) below++;
        else if (v === value) equal++;
    }

    return Math.round(((below + equal / 2) / sorted.length) * 100);
}

interface SalarySubmissionInput {
    role: string;
    city: string;
    experienceYears: number;
    ctc: number;
    companyType: 'product' | 'service' | 'startup' | 'mnc' | 'other';
    companySize?: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
    /**
     * Used ONLY for the one-hour repeat-submission check, which lives in Redis with a TTL.
     * It is never written to the row: a stored submission carries no user or guest linkage (4.6).
     */
    fingerprint?: string | null;
}

/** Repeat-submission window. Same hour the old `fingerprint` column check used. */
export const SUBMIT_COOLDOWN_SECONDS = 3600;

/** Hashed, so Redis never holds the raw guest token either. */
export function submitCooldownKey(fingerprint: string): string {
    return `salary:cooldown:v1:${createHash('sha256').update(fingerprint).digest('hex')}`;
}

/** 1 hour, per task 13. Bounds staleness for anything the write-path invalidation misses. */
export const SALARY_CACHE_TTL_SECONDS = 3600;

/**
 * Versioned so a change to the cached shape does not need a manual flush — bump `v1` and old
 * entries are simply never read again, expiring on their own.
 */
export function salaryCacheKey(role: string, city: string): string {
    return `salary:ctcs:v1:${role}:${city}`;
}

export class SalaryService {
    /**
     * Approved CTCs for a role+city, sorted ascending, cached for an hour.
     *
     * The sorted array is the right cache unit rather than either method's output.
     * `getStats` and `getBenchmark` both ran this same query and then computed different things
     * from it — and `getBenchmark`'s percentile depends on the caller's own CTC, so caching its
     * result would have needed the offer amount in the key and produced a near-zero hit rate.
     * One entry now serves both methods and every caller.
     *
     * Honest about the size of the win: with a table this small the saved query is trivial. What
     * it actually buys is that `GET /salaries/stats` is public and rate-limited at 30/min, so it
     * was a cheap way to make a stranger hit the database, and that the path is ready for the
     * seeded dataset in Phase 4 without revisiting.
     */
    private async approvedCtcs(normedRole: string, normedCity: string): Promise<number[]> {
        return cached(salaryCacheKey(normedRole, normedCity), SALARY_CACHE_TTL_SECONDS, async () => {
            const rows = await db.query.salarySubmissions.findMany({
                where: and(
                    eq(salarySubmissions.role, normedRole),
                    eq(salarySubmissions.city, normedCity),
                    eq(salarySubmissions.status, 'approved'),
                ),
            });

            // Sorted here so it is sorted in the cache too, and every reader gets it for free.
            return rows.map((r) => r.ctc).sort((a, b) => a - b);
        });
    }

    async submit(input: SalarySubmissionInput) {
        // Spam check: rate limit based on fingerprint/IP
        // For simplicity in MVP, we skip complex Redis rate limiting here and rely on global API limits
        // But we can check DB for duplicates

        // The cooldown lives in Redis, not on the row, so the stored submission needs no identity.
        // Fails open if Redis is down: same stance as the cache, and the global rate limit remains.
        const cooldownKey = input.fingerprint ? submitCooldownKey(input.fingerprint) : null;
        if (cooldownKey && (await getRedis().exists(cooldownKey).catch(() => 0))) {
            throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'You have already submitted a salary recently.', 429);
        }

        // Automatic validation heuristics
        const status = this.validate(input) ? 'approved' : 'rejected';

        const normedRole = input.role.toLowerCase().trim();
        const normedCity = input.city.toLowerCase().trim();

        // Explicit fields, not `...input`: a spread is how an identifier would creep back in.
        await db.insert(salarySubmissions).values({
            role: normedRole,
            city: normedCity,
            experienceYears: input.experienceYears,
            ctc: input.ctc,
            companyType: input.companyType,
            companySize: input.companySize,
            status,
        });

        if (cooldownKey) {
            await getRedis().set(cooldownKey, '1', 'EX', SUBMIT_COOLDOWN_SECONDS).catch(() => undefined);
        }

        // Invalidate on write rather than waiting out the hour. It matters most at exactly the
        // moment a role+city crosses MIN_SAMPLE_SIZE: without this, the submission that finally
        // made the data usable would be ignored for up to an hour, which is the one case where
        // staleness is actively confusing. Rejected submissions change nothing, so skip those.
        if (status === 'approved') {
            await cacheDelete(salaryCacheKey(normedRole, normedCity));
        }
    }

    async getStats(role: string, city: string) {
        const normedRole = role.toLowerCase().trim();
        const normedCity = city.toLowerCase().trim();

        const ctcs = await this.approvedCtcs(normedRole, normedCity);

        if (ctcs.length < MIN_SAMPLE_SIZE) {
            return {
                count: ctcs.length,
                message: 'Not enough data for this role/city combination.',
                data: null,
            };
        }

        return {
            count: ctcs.length,
            role: normedRole,
            city: normedCity,
            p25: this.percentile(ctcs, 25),
            p50: this.percentile(ctcs, 50),
            p75: this.percentile(ctcs, 75),
            p90: this.percentile(ctcs, 90),
        };
    }

    /**
     * Benchmark for the analysis pipeline (Phase 1 task 2).
     *
     * Separate from `getStats`, which serves the Salary Explorer endpoint. This one
     * returns a shape ready to drop into `salaryComparison`, or **null** when there is
     * not enough data — the caller then keeps the AI estimate.
     *
     * `getStats()` has existed and worked since the beginning and was never called by
     * the analysis worker, so every salary benchmark a user has ever seen was invented
     * by the AI while real submissions sat unread.
     */
    async getBenchmark(role: string, city: string, offerCtc: number | null) {
        const normedRole = role.toLowerCase().trim();
        const normedCity = city.toLowerCase().trim();

        const ctcs = await this.approvedCtcs(normedRole, normedCity);

        // Same floor as getStats. Percentiles from three submissions are noise wearing
        // the costume of authority, which is the failure mode this plan exists to remove.
        if (ctcs.length < MIN_SAMPLE_SIZE) return null;

        return {
            marketRange: {
                p25: Math.round(this.percentile(ctcs, 25)),
                p50: Math.round(this.percentile(ctcs, 50)),
                p75: Math.round(this.percentile(ctcs, 75)),
                p90: Math.round(this.percentile(ctcs, 90)),
            },
            offerPercentile: offerCtc === null ? null : percentileRank(ctcs, offerCtc),
            roleUsed: normedRole,
            locationUsed: normedCity,
            sampleSize: ctcs.length,
        };
    }

    private validate(input: SalarySubmissionInput): boolean {
        // Filter obviously fake data
        if (input.ctc < 100000 && input.experienceYears > 5) return false; // < 1L CTC with >5 YOE
        if (input.experienceYears > 40) return false;
        if (input.ctc > 200000000) return false; // > 20 Cr
        return true;
    }

    private percentile(arr: number[], p: number): number {
        const index = (p / 100) * (arr.length - 1);
        const lower = Math.floor(index);
        const upper = Math.ceil(index);
        const weight = index - lower;
        if (upper === lower) return arr[index];
        return arr[lower] * (1 - weight) + arr[upper] * weight;
    }
}
