import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// Mocks as in salary.lookup.test.ts: db.select().from(table).where() and an in-memory cache.
type CrowdRow = { ctc: number; createdAt: Date; years: number };
type RefRow = { ctc: number; weight: number };

const state = {
    crowd: [] as CrowdRow[],
    /** One entry per reference query, in call order. getProgression issues them in bracket order. */
    refQueue: [] as RefRow[][],
    throws: false,
    factors: [] as Array<{ nRespondents: number; factor: number }>,
    selects: [] as string[],
    factorWhere: null as unknown,
};
const store = new Map<string, unknown>();

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({
    db: {
        select: () => ({
            from: (table: Record<symbol, unknown>) => ({
                where: async (cond?: unknown) => {
                    const name = String(table[Symbol.for('drizzle:Name')]);
                    state.selects.push(name);
                    if (state.throws) {
                        throw Object.assign(new Error('Failed query: select ... params: backend engineer,bangalore'), { cause: { code: '42P01' } });
                    }
                    if (name === 'city_pay_factors') { state.factorWhere = cond; return state.factors; }
                    return name === 'salary_reference_rows' ? (state.refQueue.shift() ?? []) : state.crowd;
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

const { SalaryService } = await import('./salary.service.js');

const NOW = new Date();
const ref = (n: number, base = 1_500_000): RefRow[] => Array.from({ length: n }, (_, i) => ({ ctc: base + i * 40_000, weight: 1 }));
const crowd = (n: number, years: number, base = 3_000_000): CrowdRow[] =>
    Array.from({ length: n }, (_, i) => ({ ctc: base + i * 50_000, createdAt: NOW, years }));
const refCalls = () => state.selects.filter((s) => s === 'salary_reference_rows').length;
const crowdCalls = () => state.selects.filter((s) => s === 'salary_submissions').length;

// Six brackets: Fresher, Junior, Mid, Senior, Staff/Lead, Principal.
const BASE = { role: 'Backend Engineer', location: 'Bengaluru, Karnataka', currency: 'INR', experienceLevel: 'Mid-Level (3-5 yrs)' };
const svc = () => new SalaryService();

beforeEach(() => {
    state.crowd = [];
    state.refQueue = [];
    state.throws = false;
    state.factors = [];
    state.selects = [];
    state.factorWhere = null;
    store.clear();
});

describe('gates: each returns before any query, in a pinned order', () => {
    it('USD + Jaipur is non_inr (currency is checked first)', async () => {
        expect(await svc().getProgression({ ...BASE, currency: 'USD', location: 'Jaipur' })).toEqual({ applicable: false, reason: 'non_inr' });
        expect(state.selects).toHaveLength(0);
    });

    it('Product Manager + Jaipur is role_not_covered (role is checked before city)', async () => {
        expect(await svc().getProgression({ ...BASE, role: 'Product Manager', location: 'Jaipur' })).toEqual({ applicable: false, reason: 'role_not_covered' });
        expect(state.selects).toHaveLength(0);
    });

    it('a covered role in a non-metro (or no) city is city_not_covered', async () => {
        expect((await svc().getProgression({ ...BASE, location: 'Jaipur' })).reason).toBe('city_not_covered');
        expect((await svc().getProgression({ ...BASE, location: null })).reason).toBe('city_not_covered');
        expect(state.selects).toHaveLength(0);
    });

    it('a null, undefined or empty currency is treated as INR, like lookup()', async () => {
        for (const currency of [null, undefined, '', ' inr ']) {
            state.refQueue = [];
            expect((await svc().getProgression({ ...BASE, currency })).applicable).toBe(true);
        }
    });
});

describe('cells', () => {
    it('n = 10 gives a number, n = 9 gives none and carries the survey n', async () => {
        state.refQueue = [[], ref(9), ref(10), ref(0), ref(0), ref(0)];
        const p = await svc().getProgression(BASE);
        const [fresher, junior, mid] = p.cells!;
        expect(fresher).toMatchObject({ source: null, marketRange: null, sampleSize: 0, crowdN: 0, step: null });
        expect(junior).toMatchObject({ source: null, marketRange: null, sampleSize: 9, step: null });
        expect(mid).toMatchObject({ source: 'public_survey', sampleSize: 10 });
        expect(mid.marketRange!.p50).toBeGreaterThan(0);
        expect(p.cells).toHaveLength(6);
    });

    it('does not interpolate: a thin cell between two numeric cells leaves both without a step', async () => {
        state.refQueue = [[], ref(12, 1_000_000), ref(5), ref(12, 2_000_000), ref(0), ref(0)];
        const p = await svc().getProgression(BASE);
        expect(p.cells!.map((c) => c.source)).toEqual([null, 'public_survey', null, 'public_survey', null, null]);
        expect(p.cells!.map((c) => c.step)).toEqual([null, null, null, null, null, null]);
    });

    it('consecutive survey cells get a step computed on the rounded p50s', async () => {
        state.refQueue = [[], ref(12, 1_000_000), ref(12, 2_000_000), ref(0), ref(0), ref(0)];
        const [, junior, mid] = (await svc().getProgression(BASE)).cells!;
        expect(mid.step!.absolute).toBe(mid.marketRange!.p50 - junior.marketRange!.p50);
        expect(Number.isInteger(mid.step!.percent)).toBe(true);
    });

    it('yearsRange mirrors lookup(): Fresher 0-0, Junior 1-2, Principal open-ended', async () => {
        const p = await svc().getProgression(BASE);
        expect(p.cells![0].yearsRange).toEqual({ min: 0, max: 0 });
        expect(p.cells![1].yearsRange).toEqual({ min: 1, max: 2 });
        expect(p.cells![5].yearsRange).toEqual({ min: 12, max: null });
    });

    it('marks the user\'s own bracket, or null when the label matches none', async () => {
        expect((await svc().getProgression(BASE)).currentBracket).toBe('Mid-Level (3-5 yrs)');
        expect((await svc().getProgression({ ...BASE, experienceLevel: '' })).currentBracket).toBeNull();
        expect((await svc().getProgression({ ...BASE, experienceLevel: 'wizard' })).currentBracket).toBeNull();
    });

    it('a generic title pools the four developer families in every cell, with the same wording as the benchmark', async () => {
        const p = await svc().getProgression({ ...BASE, role: 'SDE-2' });
        expect(p.referenceFamilies).toEqual(['Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Mobile Engineer']);
        expect(p.notes![0].disclaimer).toContain('developer respondents (full-stack, back-end, front-end and mobile)');
    });

    it('names the metro and the survey note always carries the disclaimer', async () => {
        const p = await svc().getProgression(BASE);
        expect(p.cityUsed).toBe('Bangalore');
        expect(p.notes!.map((n) => n.source)).toEqual(['public_survey']);
        expect(p.notes![0].disclaimer).toContain('Modelled from public surveys, not offers in your city.');
    });
});

describe('crowdsourced cells and the never-pooled property', () => {
    it('crowd beats survey at n = 10 and the survey is not queried for that cell', async () => {
        state.crowd = crowd(10, 4); // Mid (3-5)
        state.refQueue = [[], ref(12), ref(40), ref(12), ref(12), ref(12)];
        const p = await svc().getProgression(BASE);
        const mid = p.cells![2];
        expect(mid).toMatchObject({ source: 'crowdsourced', sampleSize: 10, crowdN: 10 });
        // Mid's own survey query was skipped, so the queue shifted one slot for later cells.
        expect(refCalls()).toBe(5);
        expect(p.notes!.map((n) => n.source)).toEqual(['public_survey', 'crowdsourced']);
    });

    it('a crowd median is computed from crowd rows only (survey values never enter it)', async () => {
        state.crowd = crowd(10, 4, 5_000_000); // 50-55 lakh
        state.refQueue = [[], ref(12), ref(12), ref(12), ref(12)]; // survey ~15-20 lakh
        const mid = (await svc().getProgression(BASE)).cells![2];
        expect(mid.marketRange!.p25).toBeGreaterThan(5_000_000);
    });

    it('never steps between a survey cell and a crowd cell', async () => {
        state.crowd = crowd(10, 4);
        state.refQueue = [[], ref(12), ref(12), ref(12), ref(12)];
        const cells = (await svc().getProgression(BASE)).cells!;
        expect(cells.map((c) => c.source).slice(0, 4)).toEqual([null, 'public_survey', 'crowdsourced', 'public_survey']);
        expect(cells[2].step).toBeNull();
        expect(cells[3].step).toBeNull();
    });

    it('9 crowd rows fall through to the survey, and crowdN is reported only on the cell that needs it', async () => {
        state.crowd = crowd(9, 4);
        state.refQueue = [[], ref(12), ref(12), ref(12), ref(12), ref(12)];
        const mid = (await svc().getProgression(BASE)).cells![2];
        expect(mid).toMatchObject({ source: 'public_survey', crowdN: 9 });
    });

    it('a thin cell carries both counts: survey n and crowd n', async () => {
        state.crowd = crowd(6, 4);
        state.refQueue = [[], ref(4), ref(8)];
        const mid = (await svc().getProgression(BASE)).cells![2];
        expect(mid).toMatchObject({ source: null, marketRange: null, sampleSize: 8, crowdN: 6 });
    });

    it('rejects a poison crowd row and counts n after rejection', async () => {
        state.crowd = [...crowd(10, 4), { ctc: 1_000_000_000, createdAt: NOW, years: 4 }];
        const mid = (await svc().getProgression(BASE)).cells![2];
        expect(mid).toMatchObject({ source: 'crowdsourced', sampleSize: 10 });
        expect(mid.marketRange!.p75).toBeLessThan(5_000_000);
    });

    it('a poisoned set cannot pass on its raw count', async () => {
        state.crowd = [...crowd(9, 4), { ctc: 1_000_000_000, createdAt: NOW, years: 4 }];
        state.refQueue = [[], [], ref(3)];
        const mid = (await svc().getProgression(BASE)).cells![2];
        expect(mid).toMatchObject({ source: null, sampleSize: 3, crowdN: 9 });
    });
});

describe('failure', () => {
    let warn: ReturnType<typeof vi.spyOn>;
    beforeEach(() => { warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined); });
    afterEach(() => warn.mockRestore());

    it('a throwing query becomes lookup_error, and the log does not carry the role, city or message', async () => {
        state.throws = true;
        expect(await svc().getProgression(BASE)).toEqual({ applicable: false, reason: 'lookup_error' });
        expect(crowdCalls()).toBe(1);
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).toContain('42P01');
        expect(logged).not.toMatch(/backend engineer|bangalore|Failed query|params/i);
    });
});

describe('5.1b: PLFS city factor in the career table', () => {
    const near = (a: number, b: number) => Math.abs(a - b) <= 2;

    it('scales survey cells by the factor, never crowd cells, and sets cityAdjustment and the note', async () => {
        const run = async () => {
            state.crowd = crowd(10, 4, 5_000_000);   // Mid is a crowd cell
            state.refQueue = [[], ref(12, 1_000_000), ref(12), ref(12, 2_000_000), ref(0), ref(0)];
            return svc().getProgression(BASE);
        };
        const nat = await run();
        expect(nat).not.toHaveProperty('cityAdjustment');
        store.clear();
        state.factors = [{ nRespondents: 170, factor: 1.25 }];
        const adj = await run();

        expect(adj.cityAdjustment).toMatchObject({ city: 'bangalore', factor: 1.25, plfsSampleSize: 170 });
        expect(near(adj.cells![1].marketRange!.p50, nat.cells![1].marketRange!.p50 * 1.25)).toBe(true);   // survey: scaled
        expect(adj.cells![2]).toMatchObject({ source: 'crowdsourced' });
        expect(adj.cells![2].marketRange).toEqual(nat.cells![2].marketRange);                              // crowd: untouched
        expect(adj.cells![1].sampleSize).toBe(nat.cells![1].sampleSize);
        expect(adj.notes![0].disclaimer).toContain('adjusted for Bangalore by a factor of 1.25');
        expect(nat.notes![0].disclaimer).toContain('all cities');
    });

    it('no factor row (suppressed city): identical to today, no cityAdjustment key', async () => {
        state.refQueue = [[], ref(12, 1_000_000), ref(12), ref(0), ref(0), ref(0)];
        const p = await svc().getProgression(BASE);
        expect(p).not.toHaveProperty('cityAdjustment');
        expect(p.notes![0].disclaimer).toContain('India-wide figures');
    });

    it('no scaled survey cell (every cell crowd or thin): no cityAdjustment and the national note', async () => {
        state.factors = [{ nRespondents: 170, factor: 1.25 }];
        state.refQueue = [[], ref(4), ref(4), ref(4), ref(4), ref(4)];
        const p = await svc().getProgression(BASE);
        expect(p.cells!.every((c) => c.source !== 'public_survey')).toBe(true);
        expect(p).not.toHaveProperty('cityAdjustment');
        expect(p.notes![0].disclaimer).toContain('India-wide figures');
    });

    it('the factor read is pinned to the PLFS source version', async () => {
        state.factors = [{ nRespondents: 170, factor: 1.25 }];
        state.refQueue = [[], ref(12), ref(12), ref(0), ref(0), ref(0)];
        await svc().getProgression(BASE);
        const { params } = new PgDialect().sqlToQuery(state.factorWhere as SQL);
        expect(params).toEqual(expect.arrayContaining(['plfs_2023_24', '2023-24', 'bangalore']));
    });
});
