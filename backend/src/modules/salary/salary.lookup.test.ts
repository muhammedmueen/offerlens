import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks: db.select().from(table).where() and an in-memory cache with the real `cached` contract ──
type CrowdRow = { ctc: number; createdAt: Date };
type RefRow = { ctc: number; weight: number };

const state = {
    crowd: [] as CrowdRow[],
    refQueue: [] as RefRow[][],   // one entry per reference query, in call order
    refThrows: false,
    selects: [] as string[],
};
const store = new Map<string, unknown>();

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({
    db: {
        select: () => ({
            from: (table: { _: { name: string } } | Record<symbol, unknown>) => ({
                where: async () => {
                    const name = String((table as any)[Symbol.for('drizzle:Name')]);
                    state.selects.push(name);
                    if (name === 'salary_reference_rows') {
                        if (state.refThrows) throw new Error('relation "salary_reference_rows" does not exist');
                        return state.refQueue.shift() ?? [];
                    }
                    return state.crowd;
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

const { SalaryService, crowdCacheKey, refCacheKey } = await import('./salary.service.js');

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
    state.selects = [];
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
        const crowdKey = crowdCacheKey('backend engineer', 'bangalore');
        const refKey = refCacheKey('so_survey_2025', ['Backend Engineer'], null);
        expect(crowdKey.startsWith('salary:crowd:v2:')).toBe(true);
        expect(refKey.startsWith('salary:ref:v1:')).toBe(true);
        expect(crowdKey).not.toBe(refKey);
    });
});

describe('cache keys and caching', () => {
    it('keys for (a:b, c) and (a, b:c) differ', () => {
        expect(crowdCacheKey('a:b', 'c')).not.toBe(crowdCacheKey('a', 'b:c'));
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
