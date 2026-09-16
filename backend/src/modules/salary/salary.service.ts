import { db } from '@/db/index.js';
import { salarySubmissions } from '@/db/schema/salary-submissions.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

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
    userId?: string | null;
    fingerprint?: string | null;
}

export class SalaryService {
    async submit(input: SalarySubmissionInput) {
        // Spam check: rate limit based on fingerprint/IP
        // For simplicity in MVP, we skip complex Redis rate limiting here and rely on global API limits
        // But we can check DB for duplicates

        if (input.fingerprint) {
            const recent = await db.query.salarySubmissions.findFirst({
                where: and(
                    eq(salarySubmissions.fingerprint, input.fingerprint),
                    sql`${salarySubmissions.createdAt} > NOW() - INTERVAL '1 hour'`
                ),
            });
            if (recent) {
                throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'You have already submitted a salary recently.', 429);
            }
        }

        // Automatic validation heuristics
        const status = this.validate(input) ? 'approved' : 'rejected';

        await db.insert(salarySubmissions).values({
            ...input,
            role: input.role.toLowerCase().trim(),
            city: input.city.toLowerCase().trim(),
            status,
        });
    }

    async getStats(role: string, city: string) {
        const normedRole = role.toLowerCase().trim();
        const normedCity = city.toLowerCase().trim();

        const data = await db.query.salarySubmissions.findMany({
            where: and(
                eq(salarySubmissions.role, normedRole),
                eq(salarySubmissions.city, normedCity),
                eq(salarySubmissions.status, 'approved')
            ),
            orderBy: desc(salarySubmissions.ctc),
        });

        if (data.length < MIN_SAMPLE_SIZE) {
            return {
                count: data.length,
                message: 'Not enough data for this role/city combination.',
                data: null,
            };
        }

        const ctcs = data.map(d => d.ctc).sort((a, b) => a - b);

        return {
            count: data.length,
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

        const rows = await db.query.salarySubmissions.findMany({
            where: and(
                eq(salarySubmissions.role, normedRole),
                eq(salarySubmissions.city, normedCity),
                eq(salarySubmissions.status, 'approved'),
            ),
        });

        // Same floor as getStats. Percentiles from three submissions are noise wearing
        // the costume of authority, which is the failure mode this plan exists to remove.
        if (rows.length < MIN_SAMPLE_SIZE) return null;

        const ctcs = rows.map((r) => r.ctc).sort((a, b) => a - b);

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
            sampleSize: rows.length,
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
