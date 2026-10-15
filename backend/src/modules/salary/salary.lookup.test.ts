import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

// ── Mocks: db.select().from(table).where() and an in-memory cache with the real `cached` contract ──
type CrowdRow = { ctc: number; createdAt: Date; payBasis?: 'offered' | 'current' | null };
type RefRow = { ctc: number; weight: number };

const state = {
    crowd: [] as CrowdRow[],
    refQueue: [] as RefRow[][],   // one entry per reference query, in call order
    refThrows: false,
    factors: [] as Array<{ nRespondents: number; factor: number }>,   // city_pay_factors rows
    factorThrows: false,
    selects: [] as string[],
    crowdQueries: [] as Array<{ sql: string; params: unknown[] }>,   // rendered WHERE of each crowd select
};
const store = new Map<string, unknown>();

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({
    db: {
        select: () => ({
            from: (table: { _: { name: string } } | Record<symbol, unknown>) => ({
                where: async (cond: unknown) => {
                    const name = String((table as any)[Symbol.for('drizzle:Name')]);
                    state.selects.push(name);
                    if (name === 'salary_reference_rows') {
                        if (state.refThrows) throw new Error('relation "salary_reference_rows" does not exist');
                        return state.refQueue.shift() ?? [];
                    }
                    if (name === 'city_pay_factors') {
                        if (state.factorThrows) throw Object.assign(new Error('Failed query: select ... params: bangalore'), { cause: { code: '42P01' } });
                        return state.factors;
                    }
                    // Render the real drizzle condition, then honour a `pay_basis = $n` predicate the way SQL
                    // does: `=` never matches NULL, so NULL-basis rows only come back from the unfiltered read.
                    const q = new PgDialect().sqlToQuery(cond as never);
                    state.crowdQueries.push({ sql: q.sql, params: q.params });
                    const m = /"pay_basis" = \$(\d+)/.exec(q.sql);
                    if (!m) return state.crowd;
                    const wanted = q.params[Number(m[1]) - 1];
                    return state.crowd.filter((r) => r.payBasis === wanted);
                },
            }),
        }),
    },
}));
vi.mock('@/shared/cache.js', () => ({
    cached: async (key: string, _ttl: number, compute: () => Promise<unknown>) => {
        if (store.has(key)) return store.get(key);
        const value = await compute();
        if (value !== null && value !== undefined) store.set(key, value);
        return value;
    },
    cacheDelete: async () => undefined,
    getRedis: () => ({}),
}));

const { SalaryService, crowdCacheKey, crowdCacheKeys, refCacheKey } = await import('./salary.service.js');
const { toSalaryComparison } = await import('./benchmark-comparison.js');
const { calculateScore } = await import('@/modules/analysis/score.rubric.js');

const NOW = new Date();
const crowdRows = (n: number, base = 2_000_000, ageMonths = 0): CrowdRow[] =>
    Array.from({ length: n }, (_, i) => ({
        ctc: base + i * 50_000,
        createdAt: new Date(NOW.getTime() - ageMonths * 30.4375 * 864e5),
    }));
const refRows = (n: number, base = 1_500_000): RefRow[] =>
    Array.from({ length: n }, (_, i) => ({ ctc: base + i * 40_000, weight: 1 }));
const refCalls = () => state.selects.filter((s) => s === 'salary_reference_rows').length;

const MID = { experienceLevel: 'Mid-Level (3-5 yrs)', currency: 'INR' };
const svc = () => new SalaryService();

beforeEach(() => {
    state.crowd = [];
    state.refQueue = [];
    state.refThrows = false;
    state.factors = [];
    state.factorThrows = false;
    state.selects = [];
    state.crowdQueries = [];
    store.clear();
});

describe('tier 0: currency gate', () => {
    it('returns null before any query for a non-INR offer, even with 10 crowdsourced rows', async () => {
        state.crowd = crowdRows(10);
        expect(await svc().getBenchmark('Backend Engineer', 'Bangalore', 3_000_000, { currency: 'USD' })).toBeNull();
        expect(state.selects).toHaveLength(0);
    });
});

describe('tier 1: crowdsourced', () => {
    it('wins at n = 10 and the reference table is never queried', async () => {
        state.crowd = crowdRows(10);
        state.refQueue = [refRows(40)];
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', 2_200_000, MID);
        expect(b).toMatchObject({ source: 'crowdsourced', scope: 'role_city', sampleSize: 10, roleUsed: 'backend engineer', locationUsed: 'bangalore' });
        expect(refCalls()).toBe(0);
    });

    it('reports roleMatchConfidence 1, not 0, for an unmatched role hit on its stored string', async () => {
        state.crowd = crowdRows(10);
        const b = await svc().getBenchmark('Wizard', 'Pune', null, MID);
        expect(b).toMatchObject({ source: 'crowdsourced', roleUsed: 'wizard', roleMatchConfidence: 1 });
        expect(b!.roleMatchConfidence).not.toBe(0);
    });

    it('uses the matcher confidence for a matched role', async () => {
        state.crowd = crowdRows(10);
        expect((await svc().getBenchmark('SDE-2', 'Bengaluru', null, MID))!.roleMatchConfidence).toBe(0.9);
    });

    it('rejects a poison submission (5.3): 11 rows incl. 1e9 still gives n = 10 and a sane p90', async () => {
        state.crowd = [...crowdRows(10), { ctc: 1_000_000_000, createdAt: NOW }];
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect(b).toMatchObject({ source: 'crowdsourced', sampleSize: 10 });
        expect(b!.marketRange.p90).toBeLessThan(3_000_000);
    });

    it('applies the threshold after rejection: 10 raw rows with a poison one fall through', async () => {
        state.crowd = [...crowdRows(9), { ctc: 1_000_000_000, createdAt: NOW }];
        expect(await svc().getBenchmark('Wizard', 'Bangalore', null, MID)).toBeNull();
    });

    it('weights recent rows more (5.3): newer, higher pay pulls the median up', async () => {
        const old = crowdRows(5, 1_000_000, 60);
        const fresh = crowdRows(5, 3_000_000, 0);
        state.crowd = [...old, ...fresh];
        const b = await svc().getBenchmark('Wizard', 'Bangalore', null, MID);
        // Unweighted median would sit midway between the two groups (about 2.1M).
        expect(b!.marketRange.p50).toBeGreaterThan(2_500_000);
    });

    it('falls to the reference tier at n = 9', async () => {
        state.crowd = crowdRows(9);
        state.refQueue = [refRows(12)];
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect(b?.source).toBe('public_survey');
    });
});

describe('tiers 2 and 3: reference', () => {
    it('bracket tier wins at 10 rows, with the queried years range and title-case roleUsed', async () => {
        state.refQueue = [refRows(10)];
        const b = await svc().getBenchmark('Backend Engineer', 'Bengaluru, Karnataka', 1_800_000, MID);
        expect(b).toMatchObject({
            source: 'public_survey',
            scope: 'role_experience_national',
            roleUsed: 'Backend Engineer',
            experienceBracket: 'Mid-Level (3-5 yrs)',
            experienceYearsRange: { min: 3, max: 4 },
            locationUsed: 'India (national)',
            referenceFamilies: ['Backend Engineer'],
            sampleSize: 10,
        });
        expect(b!.offerPercentile).toBeGreaterThanOrEqual(0);
        expect(refCalls()).toBe(1);
    });

    it('open-ended bracket has a null max', async () => {
        state.refQueue = [refRows(10)];
        const b = await svc().getBenchmark('Backend Engineer', 'Pune', null, { experienceLevel: 'Principal/Director (12+ yrs)' });
        expect(b!.experienceYearsRange).toEqual({ min: 12, max: null });
    });

    it('falls to role-only when the bracket has 9 rows', async () => {
        state.refQueue = [refRows(9), refRows(30)];
        const b = await svc().getBenchmark('Backend Engineer', 'Mumbai', null, MID);
        expect(b).toMatchObject({ scope: 'role_national', experienceBracket: null, experienceYearsRange: null, sampleSize: 30 });
        expect(refCalls()).toBe(2);
    });

    it('a generic title queries the four developer families', async () => {
        state.refQueue = [refRows(10)];
        const b = await svc().getBenchmark('SDE-2', 'Hyderabad', null, MID);
        expect(b!.referenceFamilies).toEqual(['Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Mobile Engineer']);
        expect(b!.roleUsed).toBe('Software Engineer');
    });

    it('skips the reference tiers for a non-metro, an uncovered role, and queries once with no bracket', async () => {
        state.refQueue = [refRows(40), refRows(40)];
        expect(await svc().getBenchmark('Backend Engineer', 'Jaipur', null, MID)).toBeNull();
        expect(await svc().getBenchmark('Remote', 'Remote', null, MID)).toBeNull();
        expect(await svc().getBenchmark('Product Manager', 'Bangalore', null, MID)).toBeNull();
        expect(refCalls()).toBe(0);

        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, { experienceLevel: null });
        expect(b!.scope).toBe('role_national');
        expect(refCalls()).toBe(1);
    });

    it('returns null when no tier has 10 rows', async () => {
        state.refQueue = [refRows(9), refRows(9)];
        expect(await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID)).toBeNull();
    });

    it('does not apply per-request outlier rejection to survey rows (trimmed offline)', async () => {
        state.refQueue = [[...refRows(9), { ctc: 40_000_000, weight: 1 }]];
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect(b?.sampleSize).toBe(10);
    });

    it('a throwing reference query degrades to null instead of an exception', async () => {
        state.refThrows = true;
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        await expect(svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID)).resolves.toBeNull();
        expect(warn).toHaveBeenCalledWith(expect.stringContaining('[Salary] reference lookup failed'));
        warn.mockRestore();
    });
});

describe('never pooled', () => {
    it('crowdsourced values never appear in a reference summary', async () => {
        // 9 crowdsourced rows at ~90M would drag a pooled p90 sky high; the survey summary must be pure.
        state.crowd = crowdRows(9, 90_000_000);
        state.refQueue = [refRows(10, 1_500_000)];
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect(b).toMatchObject({ source: 'public_survey', sampleSize: 10 });
        expect(b!.marketRange.p90).toBeLessThan(2_000_000);
    });

    it('uses separate cache keys per source', () => {
        const crowdKey = crowdCacheKey('backend engineer', 'bangalore', 'all');
        const refKey = refCacheKey('so_survey_2025', ['Backend Engineer'], null);
        expect(crowdKey.startsWith('salary:crowd:v3:')).toBe(true);
        expect(refKey.startsWith('salary:ref:v1:')).toBe(true);
        expect(crowdKey).not.toBe(refKey);
    });
});

describe('cache keys and caching', () => {
    it('keys for (a:b, c) and (a, b:c) differ, for every basis', () => {
        for (const basis of ['offered', 'current', 'all'] as const) {
            expect(crowdCacheKey('a:b', 'c', basis)).not.toBe(crowdCacheKey('a', 'b:c', basis));
        }
    });

    it('v3 keys carry the basis, so the three reads of one cell never share a key', () => {
        const keys = crowdCacheKeys('backend engineer', 'bangalore');
        expect(keys).toEqual([
            'salary:crowd:v3:offered:backend%20engineer:bangalore',
            'salary:crowd:v3:current:backend%20engineer:bangalore',
            'salary:crowd:v3:all:backend%20engineer:bangalore',
        ]);
        expect(new Set(keys).size).toBe(3);
    });

    it('does not cache an empty reference result, so a later data load is visible at once', async () => {
        state.refQueue = [[], []];
        await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect([...store.keys()].filter((k) => k.startsWith('salary:ref:'))).toEqual([]);
    });

    it('caches a non-empty reference result', async () => {
        state.refQueue = [refRows(10)];
        await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect([...store.keys()].filter((k) => k.startsWith('salary:ref:'))).toHaveLength(1);
    });
});

describe('getStats', () => {
    it('returns the crowdsourced count (7) when there is no survey data', async () => {
        state.crowd = crowdRows(7);
        const s = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(s).toMatchObject({ count: 7, dataSource: null, data: null });
        expect(s).toHaveProperty('message');
    });

    it('returns the crowdsourced shape with p25-p90', async () => {
        state.crowd = crowdRows(10);
        const s = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(s).toMatchObject({ count: 10, dataSource: 'crowdsourced', scope: 'role_city', role: 'backend engineer', city: 'bangalore', locationUsed: 'bangalore' });
        expect(s).toHaveProperty('p25');
        expect(s).toHaveProperty('p90');
    });

    it('returns the survey shape (tier 3 only) when crowdsourced is thin, and still never mixes counts', async () => {
        state.crowd = crowdRows(3);
        state.refQueue = [refRows(25)];
        const s = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(s).toMatchObject({ count: 25, dataSource: 'public_survey', scope: 'role_national', role: 'Backend Engineer', city: 'India (national)' });
    });
});

// ── 5.6: Fresher (and any zero-row bracket) shows the range but is not ranked ──
describe('5.6: percentile withheld for an empty experience bracket', () => {
    const FRESHER = { experienceLevel: 'Fresher (0-1 yrs)', currency: 'INR' };

    it('Fresher falls to the role-wide tier with a range but no percentile', async () => {
        state.refQueue = [[], refRows(30)];   // Fresher bracket empty, then all experience
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', 1_200_000, FRESHER);
        expect(b).toMatchObject({
            source: 'public_survey', scope: 'role_national', sampleSize: 30, offerPercentile: null,
            percentileWithheld: { reason: 'no_experience_rows', yearsRange: { min: 0, max: 0 } },
        });
        expect(b!.marketRange.p50).toBeGreaterThan(0);
    });

    it('the same offer at a covered bracket IS ranked against the same role-wide rows', async () => {
        state.refQueue = [refRows(9), refRows(30)];   // thin (9 rows, not zero) -> still ranked
        const b = await svc().getBenchmark('Backend Engineer', 'Bangalore', 1_200_000, MID);
        expect(b).toMatchObject({ scope: 'role_national', sampleSize: 30 });
        expect(typeof b!.offerPercentile).toBe('number');
        expect(b!.percentileWithheld ?? null).toBeNull();
    });

    it('a non-Fresher bracket with ZERO survey rows is withheld too (Engineering Manager, Junior)', async () => {
        state.refQueue = [[], refRows(25)];
        const b = await svc().getBenchmark('Engineering Manager', 'Bangalore', 3_000_000, { experienceLevel: 'Junior (1-3 yrs)', currency: 'INR' });
        expect(b).toMatchObject({
            scope: 'role_national', offerPercentile: null,
            percentileWithheld: { reason: 'no_experience_rows', yearsRange: { min: 1, max: 2 } },
        });
    });

    it('end to end (as the worker wires it): range shown, no percentile reaches the rubric, salary unscored with the reason', async () => {
        state.refQueue = [[], refRows(30)];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', 1_200_000, FRESHER))!;
        const stored = toSalaryComparison(b);
        const score = calculateScore({
            redFlags: [], benefitsChecklist: null, extractedData: null, benefits: [],
            offerPercentile: stored.offerPercentile, salarySource: b.source, salaryScope: b.scope,
            salaryWithheld: b.percentileWithheld ? b.percentileWithheld.reason : undefined,
        });
        const salary = score.components.find((c) => c.key === 'salary')!;
        expect(stored.marketRange.p50).toBeGreaterThan(0);
        expect(stored.offerPercentile).toBeNull();
        expect(salary).toMatchObject({ value: null, weight: 0, unscoredReason: 'no_experience_rows' });
        expect(score.method).toBe('fallback');
    });

    it('no experience level is never withheld, and a crowd tier-1 win is never withheld for a Fresher', async () => {
        state.refQueue = [refRows(30)];
        const noLevel = await svc().getBenchmark('Backend Engineer', 'Bangalore', 1_200_000, { currency: 'INR' });
        expect(typeof noLevel!.offerPercentile).toBe('number');
        expect(noLevel!.percentileWithheld ?? null).toBeNull();

        state.crowd = crowdRows(10);
        store.clear();   // the first call cached the empty crowd cell
        const crowd = await svc().getBenchmark('Backend Engineer', 'Bangalore', 2_100_000, FRESHER);
        expect(crowd).toMatchObject({ source: 'crowdsourced' });
        expect(typeof crowd!.offerPercentile).toBe('number');
        expect(crowd!.percentileWithheld ?? null).toBeNull();
    });
});

// ── 5.7: hybrid like-with-like lookup ──
describe('5.7: crowd queries and NULL-basis semantics', () => {
    const hasBasis = (q: { sql: string }) => q.sql.includes('"pay_basis" = $');
    const ofBasis = (n: number, basis: 'offered' | 'current' | null, base = 2_000_000): CrowdRow[] =>
        crowdRows(n, base).map((r) => ({ ...r, payBasis: basis }));

    it('offered and current reads filter on pay_basis; the pooled read has no pay_basis predicate', async () => {
        await svc().getBenchmark('Wizard', 'Pune', null, MID);
        store.clear();   // otherwise the second lookup's pooled read is served from the cache
        await svc().getStats('Wizard', 'Pune');
        const [offered, pooled1, current, pooled2] = state.crowdQueries;
        expect(hasBasis(offered)).toBe(true);
        expect(offered.params).toContain('offered');
        expect(hasBasis(current)).toBe(true);
        expect(current.params).toContain('current');
        expect(hasBasis(pooled1)).toBe(false);
        expect(hasBasis(pooled2)).toBe(false);
        expect(pooled1.sql).not.toContain('pay_basis');
    });

    it('offered n >= 10 serves the offer: payBasis offered, no mix, and its own median', async () => {
        state.crowd = [...ofBasis(10, 'offered', 1_000_000), ...ofBasis(10, 'current', 5_000_000), ...ofBasis(3, null, 9_000_000)];
        const b = await svc().getBenchmark('Wizard', 'Pune', 1_200_000, MID);
        expect(b).toMatchObject({ source: 'crowdsourced', scope: 'role_city', payBasis: 'offered', payMix: null, sampleSize: 10 });
        expect(b!.marketRange.p50).toBeLessThan(2_000_000);   // the offered median, not the pooled one
    });

    it('the Explorer prefers current pay and gets its own median, not the offered one', async () => {
        state.crowd = [...ofBasis(10, 'offered', 1_000_000), ...ofBasis(10, 'current', 5_000_000)];
        const s = await svc().getStats('Wizard', 'Pune');
        expect(s).toMatchObject({ dataSource: 'crowdsourced', payBasis: 'current', payMix: null, count: 10 });
        expect((s as { p50: number }).p50).toBeGreaterThan(4_000_000);
    });

    it('offered 9 + pooled 15 gives a mixed result, the mix, and a percentile ranked over all 15', async () => {
        state.crowd = [...ofBasis(9, 'offered', 2_000_000), ...ofBasis(4, 'current', 3_000_000), ...ofBasis(2, null, 4_000_000)];
        const b = await svc().getBenchmark('Wizard', 'Pune', 3_000_000, MID);
        expect(b).toMatchObject({
            payBasis: 'mixed', sampleSize: 15, payMix: { offered: 9, current: 4, unlabelled: 2 },
        });
        const all = state.crowd.map((r) => r.ctc).sort((a, c) => a - c);
        expect(b!.offerPercentile).toBe(percentileRankOf(all, 3_000_000));
    });

    it('the mix is counted after outlier rejection and sums to the sample size', async () => {
        // 10 raw offered rows, one absurd: the offered tier has 9 after rejection, so it falls to pooled,
        // where the extreme row is dropped again and never shows in the mix.
        state.crowd = [...ofBasis(9, 'offered'), { ctc: 1_000_000_000, createdAt: NOW, payBasis: 'offered' },
            ...ofBasis(4, 'current', 2_100_000), ...ofBasis(2, null, 2_200_000)];
        const b = await svc().getBenchmark('Wizard', 'Pune', null, MID);
        expect(b).toMatchObject({ payBasis: 'mixed', sampleSize: 15, payMix: { offered: 9, current: 4, unlabelled: 2 } });
        const mix = b!.payMix!;
        expect(mix.offered + mix.current + mix.unlabelled).toBe(b!.sampleSize);
    });

    it('NULL rows count only in the pooled tier: 12 NULL rows never make an offered or current tier', async () => {
        state.crowd = ofBasis(12, null);
        const offer = await svc().getBenchmark('Wizard', 'Pune', null, MID);
        expect(offer).toMatchObject({ payBasis: 'mixed', payMix: { offered: 0, current: 0, unlabelled: 12 }, sampleSize: 12 });
        const explorer = await svc().getStats('Wizard', 'Pune');
        expect(explorer).toMatchObject({ payBasis: 'mixed', payMix: { offered: 0, current: 0, unlabelled: 12 } });
    });

    it('pooled under 10 falls to the survey tiers, then to null', async () => {
        state.crowd = [...ofBasis(4, 'offered'), ...ofBasis(3, 'current'), ...ofBasis(2, null)];   // 9 pooled
        state.refQueue = [refRows(10)];
        const survey = await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID);
        expect(survey).toMatchObject({ source: 'public_survey', scope: 'role_experience_national' });
        expect(survey!.payBasis ?? null).toBeNull();

        store.clear();
        state.refQueue = [refRows(9), refRows(9)];
        expect(await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID)).toBeNull();
    });

    it('a survey Explorer result has no payBasis and carries the current-pay disclaimer', async () => {
        state.refQueue = [refRows(25)];
        const s = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(s).toMatchObject({ dataSource: 'public_survey' });
        expect(s).not.toHaveProperty('payBasis');
        expect((s as { disclaimer: string }).disclaimer).toContain('Survey figures describe current pay.');
    });

    it('getStats adds payBasis, payMix and the disclaimer for a crowd result, additively', async () => {
        state.crowd = ofBasis(12, 'current');
        const s = await svc().getStats('Wizard', 'Pune');
        expect(s).toMatchObject({ count: 12, dataSource: 'crowdsourced', scope: 'role_city', payBasis: 'current' });
        expect((s as { disclaimer: string }).disclaimer).toContain('All 12 are current pay');
    });

    it('crowdCount is every approved row in the cell on every path', async () => {
        state.crowd = [...ofBasis(10, 'offered'), ...ofBasis(5, 'current'), ...ofBasis(3, null)];
        const hit = await svc().getStats('Wizard', 'Pune');   // current tier has only 5 -> pooled 18
        expect(hit).toMatchObject({ count: 18 });
        state.crowd = [...ofBasis(4, 'offered'), ...ofBasis(3, null)];
        store.clear();
        expect(await svc().getStats('Wizard', 'Pune')).toMatchObject({ count: 7, dataSource: null });
    });

    it('caches empty cells under each v3 key it read (no second query)', async () => {
        await svc().getBenchmark('Wizard', 'Pune', null, MID);
        expect(state.crowdQueries).toHaveLength(2);
        const keys = [...store.keys()].filter((k) => k.startsWith('salary:crowd:v3:'));
        expect(keys.sort()).toEqual([crowdCacheKey('wizard', 'pune', 'all'), crowdCacheKey('wizard', 'pune', 'offered')].sort());
        await svc().getBenchmark('Wizard', 'Pune', null, MID);
        expect(state.crowdQueries).toHaveLength(2);
    });
});

// ── 5.1b: PLFS city factor, survey tiers only ──
describe('5.1b: PLFS city factor', () => {
    const FACTOR = { nRespondents: 170, factor: 1.25 };
    const factorSelects = () => state.selects.filter((s) => s === 'city_pay_factors').length;
    const near = (a: number, b: number) => Math.abs(a - b) <= 2;   // summarise() rounds to whole rupees

    it('scales a tier-2 survey bracket by the factor: new scope, label, PLFS n, source and confidence unchanged', async () => {
        state.refQueue = [refRows(10), refRows(10)];
        const nat = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(nat.scope).toBe('role_experience_national');
        store.clear();
        state.factors = [FACTOR];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bengaluru', null, MID))!;
        expect(b).toMatchObject({
            source: 'public_survey', scope: 'role_experience_city_adjusted',
            locationUsed: 'India (national), adjusted for Bangalore',
            sampleSize: 10, experienceBracket: 'Mid-Level (3-5 yrs)',
            cityAdjustment: { source: 'plfs_2023_24', city: 'bangalore', cityLabel: 'Bangalore', factor: 1.25, plfsSampleSize: 170, period: '2023-24' },
        });
        for (const k of ['p25', 'p50', 'p75', 'p90'] as const) expect(near(b.marketRange[k], nat.marketRange[k] * 1.25)).toBe(true);
        expect(b.percentileWithheld ?? null).toBeNull();
    });

    it('scales tier 3 (role-wide) too, and a delhi ncr factor reads "Delhi NCR"', async () => {
        state.factors = [{ nRespondents: 86, factor: 1.25 }];
        state.refQueue = [refRows(30)];
        const b = (await svc().getBenchmark('Backend Engineer', 'Gurgaon', null, { currency: 'INR' }))!;
        expect(b).toMatchObject({ scope: 'role_city_adjusted', locationUsed: 'India (national), adjusted for Delhi NCR' });
        expect(b.cityAdjustment).toMatchObject({ city: 'delhi ncr', cityLabel: 'Delhi NCR', plfsSampleSize: 86 });
    });

    it('ranks the offer against the ADJUSTED quantiles (same offer, factor 0.79, ranks higher)', async () => {
        state.refQueue = [refRows(30)];
        const nat = (await svc().getBenchmark('Backend Engineer', 'Mumbai', 2_000_000, { currency: 'INR' }))!;
        state.factors = [{ nRespondents: 31, factor: 0.79 }];
        const adj = (await svc().getBenchmark('Backend Engineer', 'Mumbai', 2_000_000, { currency: 'INR' }))!;
        expect(adj.scope).toBe('role_city_adjusted');
        expect(adj.offerPercentile!).toBeGreaterThan(nat.offerPercentile!);
    });

    it('NEVER touches crowdsourced rows: a crowd tier wins unadjusted and the factor table is not even read', async () => {
        state.crowd = crowdRows(10);
        state.factors = [FACTOR];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', 2_200_000, MID))!;
        expect(b).toMatchObject({ source: 'crowdsourced', scope: 'role_city', locationUsed: 'bangalore' });
        expect(b).not.toHaveProperty('cityAdjustment');
        expect(b.marketRange.p50).toBeLessThan(2_600_000);   // 2.0M..2.45M crowd rows, not x1.25
        expect(factorSelects()).toBe(0);
        const stored = toSalaryComparison(b);
        expect(stored).not.toHaveProperty('cityAdjustment');
    });

    it('never pools crowd and reference: 9 thin crowd rows stay out of an adjusted survey summary', async () => {
        state.crowd = crowdRows(9, 90_000_000);
        state.factors = [FACTOR];
        state.refQueue = [refRows(10, 1_500_000)];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(b).toMatchObject({ source: 'public_survey', scope: 'role_experience_city_adjusted', sampleSize: 10 });
        expect(b.marketRange.p90).toBeLessThan(2_500_000);
    });

    it('a metro with no factor row (non-published or suppressed) serves national figures exactly, with no cityAdjustment key', async () => {
        state.refQueue = [refRows(10), refRows(10)];
        const none = (await svc().getBenchmark('Backend Engineer', 'Pune', 2_000_000, MID))!;
        expect(none).toMatchObject({ scope: 'role_experience_national', locationUsed: 'India (national)' });
        expect(none).not.toHaveProperty('cityAdjustment');
        expect(factorSelects()).toBe(1);
        // Same cached rows, factor appears for pune only: the figures differ by exactly the factor.
        state.factors = [{ nRespondents: 87, factor: 1.03 }];
        const adj = (await svc().getBenchmark('Backend Engineer', 'Pune', 2_000_000, MID))!;
        expect(adj.scope).toBe('role_experience_city_adjusted');
        expect(near(adj.marketRange.p50, none.marketRange.p50 * 1.03)).toBe(true);
    });

    it('a non-metro never reads the factor table and gets no survey benchmark at all', async () => {
        state.factors = [FACTOR];
        state.refQueue = [refRows(40)];
        expect(await svc().getBenchmark('Backend Engineer', 'Jaipur', null, MID)).toBeNull();
        expect(factorSelects()).toBe(0);
    });

    it.each([
        ['n under the floor', { nRespondents: 29, factor: 1.1 }],
        ['factor above 2.0', { nRespondents: 100, factor: 2.5 }],
        ['factor below 0.5', { nRespondents: 100, factor: 0.2 }],
        ['non-finite factor', { nRespondents: 100, factor: Number.NaN }],
    ])('ignores an unusable stored row (%s): national figures', async (_name, row) => {
        state.factors = [row];
        state.refQueue = [refRows(10)];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(b.scope).toBe('role_experience_national');
        expect(b).not.toHaveProperty('cityAdjustment');
    });

    it('a failing factor read degrades to national figures and logs the class and pg code, not the message', async () => {
        state.factorThrows = true;
        state.refQueue = [refRows(10)];
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(b).toMatchObject({ source: 'public_survey', scope: 'role_experience_national', locationUsed: 'India (national)' });
        expect(warn).toHaveBeenCalledWith('[Salary] city factor lookup failed', 'Error', '42P01');
        expect(JSON.stringify(warn.mock.calls)).not.toContain('params');
        warn.mockRestore();
    });

    it('Fresher withholding still holds under the adjusted scope: range scaled, no percentile, salary unscored', async () => {
        state.factors = [FACTOR];
        state.refQueue = [[], refRows(30)];
        const b = (await svc().getBenchmark('Backend Engineer', 'Bangalore', 1_200_000, { experienceLevel: 'Fresher (0-1 yrs)', currency: 'INR' }))!;
        expect(b).toMatchObject({
            source: 'public_survey', scope: 'role_city_adjusted', offerPercentile: null,
            percentileWithheld: { reason: 'no_experience_rows', yearsRange: { min: 0, max: 0 } },
        });
        const stored = toSalaryComparison(b);
        expect(stored).toMatchObject({ offerPercentile: null, percentileWithheld: 'no_experience_rows', benchmarkScope: 'role_city_adjusted' });
        const score = calculateScore({
            redFlags: [], benefitsChecklist: null, extractedData: null, benefits: [],
            offerPercentile: stored.offerPercentile, salarySource: b.source, salaryScope: b.scope,
            salaryWithheld: b.percentileWithheld ? b.percentileWithheld.reason : undefined,
        });
        expect(score.components.find((c) => c.key === 'salary')).toMatchObject({ value: null, weight: 0, unscoredReason: 'no_experience_rows' });
    });

    it('the n >= 10 floor is unchanged: 9 survey rows with a factor still fall through to null', async () => {
        state.factors = [FACTOR];
        state.refQueue = [refRows(9), refRows(9)];
        expect(await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID)).toBeNull();
    });

    // Cache correctness: survey rows are cached UNADJUSTED under the unchanged key, the factor is read per request.
    it('a factor loaded (or removed) after the survey rows were cached is applied on the very next request, with no flush', async () => {
        state.refQueue = [refRows(10)];
        const before = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(before.scope).toBe('role_experience_national');
        const keys = [...store.keys()].filter((k) => k.startsWith('salary:ref:'));
        expect(keys).toHaveLength(1);
        expect(keys[0]).toBe(refCacheKey('so_survey_2025', ['Backend Engineer'], { label: 'Mid-Level (3-5 yrs)' } as never));

        state.factors = [FACTOR];                       // db:load-city-factors ran; Redis was not touched
        const after = (await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!;
        expect(after.scope).toBe('role_experience_city_adjusted');
        expect(near(after.marketRange.p50, before.marketRange.p50 * 1.25)).toBe(true);
        expect(refCalls()).toBe(1);                     // second request was served from the cache
        expect([...store.keys()].filter((k) => k.startsWith('salary:ref:'))).toEqual(keys);   // nothing added or re-keyed
        expect(store.get(keys[0])).toEqual(refRows(10).map((r) => [r.ctc, r.weight]));         // cached rows are the raw ones

        state.factors = [];                             // factor removed (DELETE FROM city_pay_factors)
        expect((await svc().getBenchmark('Backend Engineer', 'Bangalore', null, MID))!.marketRange).toEqual(before.marketRange);
    });

    it('getStats carries cityAdjustment, the adjusted scope/label and the PLFS disclaimer; national and crowd results do not', async () => {
        state.factors = [FACTOR];
        state.refQueue = [refRows(25)];
        const s = await svc().getStats('Backend Engineer', 'Bangalore') as Record<string, unknown>;
        expect(s).toMatchObject({
            dataSource: 'public_survey', scope: 'role_city_adjusted', city: 'India (national), adjusted for Bangalore',
            cityAdjustment: { factor: 1.25, plfsSampleSize: 170, cityLabel: 'Bangalore' },
        });
        expect(s.disclaimer).toContain('city factor of 1.25');

        state.factors = [];
        const nat = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(nat).toMatchObject({ scope: 'role_national', city: 'India (national)' });
        expect(nat).not.toHaveProperty('cityAdjustment');

        state.crowd = crowdRows(10);
        state.factors = [FACTOR];
        store.clear();
        const crowd = await svc().getStats('Backend Engineer', 'Bangalore');
        expect(crowd).toMatchObject({ dataSource: 'crowdsourced' });
        expect(crowd).not.toHaveProperty('cityAdjustment');
    });
});

// Weighted rank with all weights ~1 (rows are brand new), matching summarise's midpoint convention.
function percentileRankOf(sorted: number[], value: number): number {
    const below = sorted.filter((v) => v < value).length;
    const equal = sorted.filter((v) => v === value).length;
    return Math.round(((below + equal / 2) / sorted.length) * 100);
}