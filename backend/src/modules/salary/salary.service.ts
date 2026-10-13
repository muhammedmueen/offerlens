import { db } from '@/db/index.js';
import { salarySubmissions } from '@/db/schema/salary-submissions.js';
import { salaryReferenceRows } from '@/db/schema/salary-reference-rows.js';
import { createHash } from 'node:crypto';
import { eq, and, inArray, isNull, gte, lt } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { cached, cacheDelete, getRedis } from '@/shared/cache.js';
import { ACTIVE_REFERENCE_SOURCES } from './reference-source.js';
import { matchRole, canonicalCity, isIndianMetro, bracketFromLabel, type ExperienceBracket } from './role-matching.js';
import { MIN_SAMPLE_SIZE, recencyWeight, rejectOutliers, summarise, weightedPercentileRank, type WeightedValue } from './salary.stats.js';
import { EXPERIENCE } from '@/db/seed-data.js';
import { addSteps, progressionNotes, type Progression, type ProgressionCell } from './progression.js';

/**
 * Minimum rows (after outlier rejection) before a benchmark is reported. Defined once in
 * `salary.stats.ts` (10, per Stage 2a of the plan) and re-exported so existing imports keep working.
 */
export { MIN_SAMPLE_SIZE };

export type BenchmarkSource = 'crowdsourced' | 'public_survey';
export type BenchmarkScope = 'role_city' | 'role_experience_national' | 'role_national';

export interface Benchmark {
    source: BenchmarkSource;
    scope: BenchmarkScope;
    marketRange: { p25: number; p50: number; p75: number; p90: number };
    /** Null when the letter states no CTC. */
    offerPercentile: number | null;
    /** Tier 1: the lowercase crowd key. Tiers 2-3: the seed label in title case. */
    roleUsed: string;
    /** Survey families pooled for a public_survey result; [] otherwise. */
    referenceFamilies: readonly string[];
    /** The matcher's confidence; 1 for an exact stored-string hit on an unmatched role. Never 0. */
    roleMatchConfidence: number;
    /** Canonical city for crowdsourced; 'India (national)' for the survey. */
    locationUsed: string;
    sampleSize: number;
    /** Seed bracket label for tier 2 (display name only); null otherwise. */
    experienceBracket: string | null;
    /** Years actually queried, inclusive; max null = open end. Null for tier 1 and tier 3. */
    experienceYearsRange: { min: number; max: number | null } | null;
}

export interface BenchmarkContext {
    /** The upload form's experience label. */
    experienceLevel?: string | null;
    /** extractedData.compensation.currency */
    currency?: string | null;
}

/**
 * Where `value` sits within `sorted`, as a 0-100 percentile rank (midpoint convention: values equal
 * to the offer count as half below, so matching the lowest submission is not the 0th percentile).
 * Delegates to the weighted version with weights of 1. Pure, tested without a database.
 */
export function percentileRank(sorted: number[], value: number): number {
    return weightedPercentileRank(sorted.map((v) => ({ value: v, weight: 1 })), value);
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

/** UTC midnight of `now`. Stored timestamps are coarsened to this (5.4, D6). */
export function dayStartUtc(now: Date): Date {
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** 1 hour, per task 13. Bounds staleness for anything the write-path invalidation misses. */
export const SALARY_CACHE_TTL_SECONDS = 3600;

// Every variable segment is encoded: role and city can derive from model-supplied text, and a raw
// ':' or ',' could collide with a neighbouring cell's key. encodeURIComponent escapes both.
const enc = encodeURIComponent;

/**
 * Crowdsourced cell: `Array<[ctc, createdAtMs]>` sorted by ctc. Versioned so a shape change needs
 * no manual flush. The old `salary:ctcs:v1:*` entries are never read again and expire on their own.
 */
export function crowdCacheKey(roleKey: string, cityKey: string): string {
    return `salary:crowd:v2:${enc(roleKey)}:${enc(cityKey)}`;
}

/** Reference cell: `Array<[ctc, weight]>` sorted by ctc, non-empty only. */
export function refCacheKey(source: string, families: readonly string[], bracket: ExperienceBracket | null): string {
    return `salary:ref:v1:${enc(source)}:${families.map(enc).join(',')}:${bracket ? enc(bracket.label) : 'all'}`;
}

const NATIONAL = 'India (national)';

export class SalaryService {
    /**
     * Approved crowdsourced `[ctc, createdAtMs]` pairs for a role+city, cached for an hour.
     *
     * Selects `ctc` and `created_at` only: nothing that could identify a submitter is read (4.6).
     * The cached unit is the raw pairs, not a summary, because the offer percentile depends on the
     * caller's own CTC and recency weights change daily; both are applied after the cache read.
     */
    private async crowdRows(roleKey: string, cityKey: string): Promise<Array<[number, number]>> {
        // ponytail: the key holds caller-supplied role/city (<= 120 chars each) and an empty cell is
        // cached, so a caller can create many tiny keys that live 3600 s. The 30/min route limit slows
        // that per client but does not cap it: each fresh guest cookie gets its own 30/min, and cookies
        // are minted at up to 100/min per IP (global limit), so one IP can still add on the order of
        // thousands of keys a minute. Fine at personal-project scale. Upgrade path: skip the write for
        // an empty array when the role is unmatched (or a shorter TTL for empty cells).
        return cached(crowdCacheKey(roleKey, cityKey), SALARY_CACHE_TTL_SECONDS, async () => {
            const rows = await db
                .select({ ctc: salarySubmissions.ctc, createdAt: salarySubmissions.createdAt })
                .from(salarySubmissions)
                .where(and(
                    eq(salarySubmissions.role, roleKey),
                    eq(salarySubmissions.city, cityKey),
                    eq(salarySubmissions.status, 'approved'),
                ));

            return rows
                .map((r): [number, number] => [r.ctc, r.createdAt.getTime()])
                .sort((a, b) => a[0] - b[0]);
        });
    }

    /**
     * National reference `[ctc, weight]` pairs for the given families (and bracket, half-open).
     *
     * An empty result is returned as null from the compute so it is NEVER cached: `cached()` skips
     * only null/undefined, and a cached `[]` would hide a `db:load-reference` run for an hour.
     */
    private async refRows(families: readonly string[], bracket: ExperienceBracket | null): Promise<Array<[number, number]>> {
        const source = ACTIVE_REFERENCE_SOURCES[0];
        const rows = await cached<Array<[number, number]> | null>(
            refCacheKey(source, families, bracket),
            SALARY_CACHE_TTL_SECONDS,
            async () => {
                const found = await db
                    .select({ ctc: salaryReferenceRows.ctc, weight: salaryReferenceRows.weight })
                    .from(salaryReferenceRows)
                    .where(and(
                        eq(salaryReferenceRows.source, source),
                        inArray(salaryReferenceRows.role, [...families]),
                        isNull(salaryReferenceRows.city),
                        bracket ? gte(salaryReferenceRows.experienceYears, bracket.minYears) : undefined,
                        bracket ? lt(salaryReferenceRows.experienceYears, bracket.maxYears) : undefined,
                    ));
                return found.length
                    ? found.map((r): [number, number] => [r.ctc, r.weight]).sort((a, b) => a[0] - b[0])
                    : null;
            },
        );
        return rows ?? [];
    }

    /**
     * The ordered lookup shared by `getBenchmark` and `getStats`:
     *   1. crowdsourced, role + city, n >= 10 (after outlier rejection, recency-weighted)
     *   2. reference, role family + experience bracket, national, n >= 10
     *   3. reference, role family only, national, n >= 10
     *   4. null (the caller keeps the AI estimate)
     * Each tier summarises ITS OWN rows. Crowdsourced and reference rows are never pooled.
     */
    private async lookup(
        role: string,
        city: string,
        offerCtc: number | null,
        ctx: BenchmarkContext,
    ): Promise<{ benchmark: Benchmark | null; crowdCount: number }> {
        if (!role.trim() || !city.trim()) return { benchmark: null, crowdCount: 0 };

        // Tier 0. Every stored distribution is INR, so a USD or GBP offer must not be ranked
        // against either. Known limit: the extraction schema defaults a missing currency to INR.
        if (ctx.currency && ctx.currency.trim().toUpperCase() !== 'INR') {
            return { benchmark: null, crowdCount: 0 };
        }

        const match = matchRole(role);
        const cityKey = canonicalCity(city) ?? city.slice(0, 120).toLowerCase().trim();

        // Tier 1.
        const crowd = await this.crowdRows(match.crowdKey, cityKey);
        const now = Date.now();
        const crowdSummary = summarise(
            crowd.map(([value, createdAt]): WeightedValue => ({ value, weight: recencyWeight(createdAt, now) })),
            offerCtc,
            { rejectOutliers: true },
        );
        if (crowdSummary) {
            return {
                crowdCount: crowd.length,
                benchmark: {
                    source: 'crowdsourced',
                    scope: 'role_city',
                    ...crowdSummary,
                    roleUsed: match.crowdKey,
                    referenceFamilies: [],
                    // An unmatched role hit its exact stored string, which is a full match, not 0.
                    roleMatchConfidence: match.canonical === null ? 1 : match.confidence,
                    locationUsed: cityKey,
                    experienceBracket: null,
                    experienceYearsRange: null,
                },
            };
        }

        // Tiers 2 and 3: major Indian metros and roles with reference data only.
        if (match.referenceFamilies.length === 0 || !isIndianMetro(city)) {
            return { benchmark: null, crowdCount: crowd.length };
        }

        try {
            const families = match.referenceFamilies;
            const bracket = bracketFromLabel(ctx.experienceLevel);
            const base = {
                source: 'public_survey' as const,
                roleUsed: match.canonical!, // non-null: families are only set when a label matched
                referenceFamilies: families,
                roleMatchConfidence: match.confidence,
                locationUsed: NATIONAL,
            };
            const toWeighted = (rows: Array<[number, number]>) =>
                rows.map(([value, weight]): WeightedValue => ({ value, weight }));

            if (bracket) {
                const s = summarise(toWeighted(await this.refRows(families, bracket)), offerCtc, { rejectOutliers: false });
                if (s) {
                    return {
                        crowdCount: crowd.length,
                        benchmark: {
                            ...base, ...s,
                            scope: 'role_experience_national',
                            experienceBracket: bracket.label,
                            // Half-open in the query, so the inclusive top is maxYears - 1; 99 = open end.
                            experienceYearsRange: { min: bracket.minYears, max: bracket.maxYears >= 99 ? null : bracket.maxYears - 1 },
                        },
                    };
                }
            }

            // ponytail: tier 3 ranks the offer against ALL experience levels, and the SO India
            // sample skews junior, so senior offers read high. Disclaimed as "all experience
            // levels"; the upgrade path is to show the range without scoring this scope.
            const s = summarise(toWeighted(await this.refRows(families, null)), offerCtc, { rejectOutliers: false });
            if (s) {
                return {
                    crowdCount: crowd.length,
                    benchmark: { ...base, ...s, scope: 'role_national', experienceBracket: null, experienceYearsRange: null },
                };
            }
        } catch (err) {
            // Degrade to "not enough data" / the AI estimate rather than failing a request.
            console.warn(`[Salary] reference lookup failed: ${(err as Error).message}`);
        }

        return { benchmark: null, crowdCount: crowd.length };
    }

    /**
     * Pay by experience bracket for the career path (5.5): one cell per EXPERIENCE bracket, the same
     * objects lookup tier 2 uses. Per cell: crowdsourced role + city if n >= 10 after outlier
     * rejection, else survey role family + bracket if n >= 10, else "not enough data" (no number, no
     * interpolation). Each source is summarised by its own `summarise()` call and never pooled.
     * Never throws: a lookup failure comes back as `lookup_error` so the narrative still renders.
     */
    async getProgression(input: {
        role: string;
        location: string | null;
        currency?: string | null;
        experienceLevel?: string | null;
    }): Promise<Progression> {
        // Gates in a pinned order; each returns before any query.
        // Same known limit as lookup(): a missing currency is treated as INR.
        if (input.currency && input.currency.trim().toUpperCase() !== 'INR') return { applicable: false, reason: 'non_inr' };
        const match = matchRole(input.role);
        if (match.referenceFamilies.length === 0) return { applicable: false, reason: 'role_not_covered' };
        const cityKey = input.location ? canonicalCity(input.location) : null;
        if (!cityKey) return { applicable: false, reason: 'city_not_covered' };

        try {
            const families = match.referenceFamilies;
            const now = Date.now();
            const crowd = await this.crowdRowsByYears(match.crowdKey, cityKey);

            const cells = await Promise.all(EXPERIENCE.map(async (b): Promise<ProgressionCell> => {
                const base = {
                    bracket: b.label,
                    yearsRange: { min: b.minYears, max: b.maxYears >= 99 ? null : b.maxYears - 1 },
                    step: null,
                };
                const crowdItems = crowd
                    .filter(([, , years]) => years >= b.minYears && years < b.maxYears)
                    .map(([value, createdAt]): WeightedValue => ({ value, weight: recencyWeight(createdAt, now) }));
                const c = summarise(crowdItems, null, { rejectOutliers: true });
                if (c) {
                    return { ...base, sampleSize: c.sampleSize, crowdN: c.sampleSize, source: 'crowdsourced',
                        marketRange: { p25: c.marketRange.p25, p50: c.marketRange.p50, p75: c.marketRange.p75 } };
                }

                const ref = await this.refRows(families, b);
                const s = summarise(ref.map(([value, weight]): WeightedValue => ({ value, weight })), null, { rejectOutliers: false });
                const crowdN = rejectOutliers(crowdItems).length;
                return s
                    ? { ...base, sampleSize: s.sampleSize, crowdN, source: 'public_survey',
                        marketRange: { p25: s.marketRange.p25, p50: s.marketRange.p50, p75: s.marketRange.p75 } }
                    : { ...base, sampleSize: ref.length, crowdN, source: null, marketRange: null };
            }));

            const withSteps = addSteps(cells);
            const current = bracketFromLabel(input.experienceLevel);
            return {
                applicable: true,
                roleUsed: match.canonical!, // non-null: families are only set when a label matched
                cityUsed: cityKey.replace(/\b[a-z]/g, (ch) => ch.toUpperCase()).replace('Ncr', 'NCR'),
                referenceFamilies: families,
                currentBracket: current?.label ?? null,
                cells: withSteps,
                notes: progressionNotes(withSteps, families),
            };
        } catch (err) {
            // Fixed string + error class + pg code only. NOT err.message: Drizzle's query error
            // message embeds the SQL and its bound role/city/family values.
            console.warn('[Salary] progression lookup failed', err instanceof Error ? err.name : 'unknown',
                (err as { cause?: { code?: string } }).cause?.code ?? '');
            return { applicable: false, reason: 'lookup_error' };
        }
    }

    /**
     * Approved crowdsourced `[ctc, createdAtMs, experienceYears]` for a role+city, for the career
     * progression. Uncached: it runs once per career drawer open, not per analysis.
     * ponytail: reads every approved row for this (role, city) on each drawer open (bounded by the
     * global 100/min per user). Ceiling: a role+city with thousands of rows. Upgrade: cache a
     * [ctc, createdAt, years] tuple under a new key and cacheDelete it in submit() next to crowdCacheKey.
     */
    private async crowdRowsByYears(roleKey: string, cityKey: string): Promise<Array<[number, number, number]>> {
        const rows = await db
            .select({ ctc: salarySubmissions.ctc, createdAt: salarySubmissions.createdAt, years: salarySubmissions.experienceYears })
            .from(salarySubmissions)
            .where(and(
                eq(salarySubmissions.role, roleKey),
                eq(salarySubmissions.city, cityKey),
                eq(salarySubmissions.status, 'approved'),
            ));
        return rows.map((r): [number, number, number] => [r.ctc, r.createdAt.getTime(), r.years]);
    }

    async submit(input: SalarySubmissionInput) {
        // Spam check: rate limit based on fingerprint/IP
        // For simplicity in MVP, we skip complex Redis rate limiting here and rely on global API limits
        // But we can check DB for duplicates

        // The cooldown lives in Redis, not on the row, so the stored submission needs no identity.
        // Fails open if Redis is down: same stance as the cache, and the global rate limit remains.
        const cooldownKey = input.fingerprint ? submitCooldownKey(input.fingerprint) : null;
        if (cooldownKey && (await getRedis().exists(cooldownKey).catch(() => 0))) {
            // details.reason lets the UI tell this cooldown from the global limiter's 429 (5.4, D7).
            throw new AppError(ERROR_CODES.RATE_LIMIT_EXCEEDED, 'You have already submitted a salary recently.', 429, {
                reason: 'ALREADY_SUBMITTED',
            });
        }

        // Automatic validation heuristics
        const status = this.validate(input) ? 'approved' : 'rejected';

        // Stored under the same keys the lookup reads, so "SDE-2" / "Bengaluru, Karnataka" reach
        // rows stored as "software engineer" / "bangalore".
        // ponytail: rows stored before this change under a raw non-canonical variant (for example
        // "sde-2") are unreachable. The table is nearly empty; a one-off UPDATE fixes it if needed.
        const normedRole = matchRole(input.role).crowdKey;
        const normedCity = canonicalCity(input.city) ?? input.city.toLowerCase().trim();

        const day = dayStartUtc(new Date());

        // Explicit fields, not `...input`: a spread is how an identifier would creep back in.
        await db.insert(salarySubmissions).values({
            role: normedRole,
            city: normedCity,
            experienceYears: input.experienceYears,
            ctc: input.ctc,
            companyType: input.companyType,
            companySize: input.companySize,
            status,
            // Day-level only (5.4, D6): an exact ms would let a request-log line be joined to this row.
            createdAt: day,
            updatedAt: day,
        });

        if (cooldownKey) {
            await getRedis().set(cooldownKey, '1', 'EX', SUBMIT_COOLDOWN_SECONDS).catch(() => undefined);
        }

        // Invalidate on write rather than waiting out the hour. It matters most at exactly the
        // moment a role+city crosses MIN_SAMPLE_SIZE. Rejected submissions change nothing.
        if (status === 'approved') {
            await cacheDelete(crowdCacheKey(normedRole, normedCity));
        }
    }

    /**
     * Salary Explorer. `GET /salaries/stats` is public and unauthenticated by design; it is limited
     * to 30/min per signed-in user, guest cookie, or (cookie-less) IP by the route (`RATE_LIMITS.salaryStats`).
     *
     * Without an experience level this can reach tiers 1 and 3 only. In the not-enough case `count`
     * is the number of approved crowdsourced rows (never a survey count).
     */
    async getStats(role: string, city: string) {
        const { benchmark, crowdCount } = await this.lookup(role, city, null, {});

        if (!benchmark) {
            return {
                count: crowdCount,
                dataSource: null,
                message: 'Not enough data for this role/city combination.',
                data: null,
            };
        }

        return {
            count: benchmark.sampleSize,
            dataSource: benchmark.source,
            scope: benchmark.scope,
            role: benchmark.roleUsed,
            city: benchmark.locationUsed,
            locationUsed: benchmark.locationUsed,
            ...benchmark.marketRange,
        };
    }

    /**
     * Benchmark for the analysis pipeline: a shape ready for `toSalaryComparison`, or **null** when
     * no tier has enough data, in which case the caller keeps the AI estimate.
     */
    async getBenchmark(
        role: string,
        city: string,
        offerCtc: number | null,
        ctx: BenchmarkContext = {},
    ): Promise<Benchmark | null> {
        return (await this.lookup(role, city, offerCtc, ctx)).benchmark;
    }

    private validate(input: SalarySubmissionInput): boolean {
        // Filter obviously fake data
        if (input.ctc < 100000 && input.experienceYears > 5) return false; // < 1L CTC with >5 YOE
        if (input.experienceYears > 40) return false;
        if (input.ctc > 200000000) return false; // > 20 Cr
        return true;
    }
}
