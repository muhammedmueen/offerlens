import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { AppError } from '@/shared/errors/app-error.js';
import { CORRECTABLE_PATHS, setNestedValue, validateCorrection } from './correctable-fields.js';

// DB-free: the db module is mocked with a transaction recorder (offer.service.quota.test.ts
// pattern) and fn-backed query.*.findFirst (career.service.test.ts pattern). The real pure
// calculateTakeHome / calculateScore / checkBenefits run unmocked so the recompute is exercised
// end to end without a benchmark.

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', AI_PROVIDER: 'mock' }; } }));

const offersFindFirst = vi.fn();
const analysesFindFirst = vi.fn();

// Transaction recorder: captures every call against the tx handle.
type Captured = { kind: 'update' | 'insert'; set?: any; values?: any; conflict?: any };
let txCalls: Captured[] = [];
const makeTx = () => ({
    update: (_t: unknown) => ({ set: (set: any) => ({ where: async () => { txCalls.push({ kind: 'update', set }); } }) }),
    insert: (_t: unknown) => ({
        values: (values: any) => ({
            onConflictDoUpdate: (conflict: any) => { txCalls.push({ kind: 'insert', values, conflict }); return Promise.resolve(); },
        }),
    }),
});

const correctionsFindMany = vi.fn();
vi.mock('@/db/index.js', () => ({
    db: {
        query: {
            offers: { findFirst: (...a: unknown[]) => offersFindFirst(...a) },
            analyses: { findFirst: (...a: unknown[]) => analysesFindFirst(...a) },
            corrections: { findMany: (...a: unknown[]) => correctionsFindMany(...a) },
        },
        transaction: async (fn: (t: ReturnType<typeof makeTx>) => Promise<unknown>) => fn(makeTx()),
    },
}));

// Schema tables are referenced as .offerId/.field in onConflictDoUpdate targets; the real
// drizzle objects are fine here (no DB hit).
const cacheDelete = vi.fn();
vi.mock('@/shared/cache.js', () => ({ cacheDelete: (...a: unknown[]) => cacheDelete(...a) }));

let CorrectionService: typeof import('./correction.service.js').CorrectionService;
let careerPathCacheKey: typeof import('@/modules/career/career.service.js').careerPathCacheKey;
beforeAll(async () => {
    ({ CorrectionService } = await import('./correction.service.js'));
    ({ careerPathCacheKey } = await import('@/modules/career/career.service.js'));
}, 30_000);

const OFFER = { id: 'o1', userId: 'u1', guestId: null, status: 'COMPLETED' };

function baseExtractedData(over: Record<string, unknown> = {}) {
    return {
        companyName: 'Acme', role: 'Backend Engineer', location: 'Pune',
        department: null, joiningDate: null, industry: null, companyType: null,
        employmentType: 'full-time',
        compensation: {
            currency: 'INR',
            baseSalary: { amount: 1_200_000, period: 'annual' },
            variablePay: null, equity: null,
            totalCTC: 1_200_000, otherComponents: [],
        },
        noticePeriod: '30 days', probationPeriod: '3 months',
        ...over,
    };
}

function baseAnalysis(over: Record<string, unknown> = {}) {
    return {
        offerId: 'o1', score: 55, scoreLabel: 'weak', scoringMethod: 'fallback',
        extractedData: baseExtractedData(),
        redFlags: [], benefits: [],
        salaryComparison: {
            marketRange: { p25: 1_000_000, p50: 2_000_000, p75: 3_000_000, p90: 4_000_000 },
            offerPercentile: 20, roleUsed: 'Backend Engineer', roleMatchConfidence: 1,
            locationUsed: 'Pune', dataSource: 'crowdsourced', disclaimer: null,
            benchmarkScope: 'role_city',
        },
        takeHome: null,
        scoreBreakdown: { components: [], note: null },
        ...over,
    };
}

beforeEach(() => {
    txCalls = [];
    for (const f of [offersFindFirst, analysesFindFirst, correctionsFindMany, cacheDelete]) f.mockClear();
    offersFindFirst.mockResolvedValue({ ...OFFER });
    analysesFindFirst.mockResolvedValue(baseAnalysis());
    vi.spyOn(console, 'log').mockImplementation(() => {});
});

const svc = () => new CorrectionService();

describe('CorrectionService.applyCorrections', () => {
    // §9.1
    it('applies the corrected value onto extractedData in the analyses update', async () => {
        const r = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 3_000_000 },
        ]);
        expect(r.changed).toBe(true);
        const update = txCalls.find((c) => c.kind === 'update');
        expect(update?.set.extractedData.compensation.totalCTC).toBe(3_000_000);
    });

    // §9.2
    it('writes the audit row via onConflictDoUpdate on (offerId, field), not a bare insert', async () => {
        await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.companyName', correctedValue: 'Globex' },
        ]);
        const insert = txCalls.find((c) => c.kind === 'insert');
        expect(insert).toBeTruthy();
        expect(insert?.values.field).toBe('extractedData.companyName');
        expect(insert?.conflict.target).toHaveLength(2);
        expect(insert?.conflict.set.correctedValue).toBe('Globex');
    });

    // §9.3
    it('no-op skip: correcting a value to its current value changes nothing, writes nothing', async () => {
        const r = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 1_200_000 },
        ]);
        expect(r).toEqual({ changed: false, correctionsApplied: 0, totalSubmitted: 1 });
        expect(txCalls).toHaveLength(0);
        expect(cacheDelete).not.toHaveBeenCalled();
    });

    // §9.4
    it('rejects a non-allowlisted field with INVALID_INPUT 400 and writes nothing', async () => {
        await expect(svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.__proto__.x', correctedValue: 'evil' },
        ])).rejects.toMatchObject({ code: 'INVALID_INPUT', statusCode: 400 });
        expect(txCalls).toHaveLength(0);
    });

    // §9.5
    it.each([
        ['string for a number field', 'extractedData.compensation.totalCTC', 'lots'],
        ['negative CTC', 'extractedData.compensation.totalCTC', -5],
        ['NaN CTC', 'extractedData.compensation.totalCTC', NaN],
        ['object for a text field', 'extractedData.role', { nested: 1 }],
    ])('rejects a bad correctedValue (%s) with INVALID_INPUT', async (_n, field, value) => {
        await expect(svc().applyCorrections('o1', 'u1', [{ field, correctedValue: value }]))
            .rejects.toMatchObject({ code: 'INVALID_INPUT', statusCode: 400 });
        expect(txCalls).toHaveLength(0);
    });

    // §9.6 (a) — real benchmark + non-null percentile: takeHome and score recomputed
    it('recomputes takeHome and score from a corrected totalCTC (real benchmark)', async () => {
        const r = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 3_000_000 },
        ]);
        expect(r.changed).toBe(true);
        const set = txCalls.find((c) => c.kind === 'update')?.set;

        // takeHome recomputed from the corrected CTC (and the seeded baseSalary).
        expect(set.takeHome).toBeTruthy();
        expect(set.takeHome.tax.grossAnnual).toBe(3_000_000);
        // With baseSalary 1.2M annual, PF is computed — proves annualBasic was supplied.
        expect(set.takeHome.employeePf.statutoryMinimum).not.toBeNull();

        // score/scoreBreakdown recomputed and written as the { components, note } envelope.
        expect(typeof set.score).toBe('number');
        expect(set.scoreBreakdown).toHaveProperty('components');
        expect(set.scoreBreakdown).toHaveProperty('note');
        expect(Array.isArray(set.scoreBreakdown.components)).toBe(true);

        // marketRange unchanged; offerPercentile re-interpolated against it.
        expect(set.salaryComparison.marketRange).toEqual({ p25: 1_000_000, p50: 2_000_000, p75: 3_000_000, p90: 4_000_000 });
        // 3,000,000 sits exactly at p75 → percentile 75.
        expect(set.salaryComparison.offerPercentile).toBe(75);
    });

    it('takeHome reflects the seeded stored baseSalary (a null basic would differ)', async () => {
        analysesFindFirst.mockResolvedValue(baseAnalysis({
            extractedData: baseExtractedData({
                compensation: { currency: 'INR', baseSalary: null, variablePay: null, equity: null, totalCTC: 1_200_000, otherComponents: [] },
            }),
        }));
        const set = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 3_000_000 },
        ]).then(() => txCalls.find((c) => c.kind === 'update')?.set);
        // No basic → PF excluded (null), unlike the seeded-basic case above.
        expect(set.takeHome.employeePf.statutoryMinimum).toBeNull();
    });

    // §9.6 (b) — unscored branches leave the score alone
    it.each([
        ['ai_estimated', { dataSource: 'ai_estimated', offerPercentile: 50 }],
        ['null percentile', { offerPercentile: null }],
        ['withheld (flat string)', { percentileWithheld: 'no_experience_rows' }],
    ])('leaves score and salaryComparison untouched when stored salary is unscored (%s)', async (_n, salaryOver) => {
        analysesFindFirst.mockResolvedValue(baseAnalysis({
            salaryComparison: {
                marketRange: { p25: 1_000_000, p50: 2_000_000, p75: 3_000_000, p90: 4_000_000 },
                offerPercentile: 20, roleUsed: 'r', roleMatchConfidence: 1, locationUsed: 'Pune',
                dataSource: 'crowdsourced', disclaimer: null, benchmarkScope: 'role_city',
                ...salaryOver,
            },
        }));
        const set = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 3_000_000 },
        ]).then(() => txCalls.find((c) => c.kind === 'update')?.set);
        // takeHome still recomputes (always clean), but the salary/score are left as stored.
        expect(set.takeHome).toBeTruthy();
        expect(set.score).toBeUndefined();
        expect(set.scoreBreakdown).toBeUndefined();
        expect(set.salaryComparison).toBeUndefined();
    });

    // §9.7 — recompute failure is soft
    it('still writes the extractedData overlay when the recompute throws', async () => {
        const err = vi.spyOn(console, 'error').mockImplementation(() => {});
        // Malformed marketRange (not an object) makes reRank throw inside the recompute.
        analysesFindFirst.mockResolvedValue(baseAnalysis({
            salaryComparison: { marketRange: 'broken', offerPercentile: 20, dataSource: 'crowdsourced' },
        }));
        const r = await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.compensation.totalCTC', correctedValue: 3_000_000 },
        ]);
        err.mockRestore();
        expect(r.changed).toBe(true);
        const set = txCalls.find((c) => c.kind === 'update')?.set;
        expect(set.extractedData.compensation.totalCTC).toBe(3_000_000);
    });

    // §9.8 — COR-2 cache trigger
    it.each([
        ['extractedData.compensation.totalCTC', 3_000_000, false],
        ['extractedData.noticePeriod', '60 days', false],
        ['extractedData.probationPeriod', '6 months', false],
        ['extractedData.role', 'Staff Engineer', true],
        ['extractedData.location', 'Bengaluru', true],
    ])('career cache: %s dropped=%s', async (field, value, dropped) => {
        await svc().applyCorrections('o1', 'u1', [{ field, correctedValue: value }]);
        if (dropped) {
            expect(cacheDelete).toHaveBeenCalledTimes(1);
            expect(cacheDelete).toHaveBeenCalledWith(careerPathCacheKey('o1'));
        } else {
            expect(cacheDelete).not.toHaveBeenCalled();
        }
    });

    // §9.9 — atomicity: both writes run against the tx handle
    it('runs the analyses update and the audit upsert in one transaction', async () => {
        await svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.companyName', correctedValue: 'Globex' },
        ]);
        expect(txCalls.some((c) => c.kind === 'update')).toBe(true);
        expect(txCalls.some((c) => c.kind === 'insert')).toBe(true);
    });

    it('404s when the analysis is missing', async () => {
        analysesFindFirst.mockResolvedValue(undefined);
        await expect(svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.companyName', correctedValue: 'Globex' },
        ])).rejects.toBeInstanceOf(AppError);
    });

    it('400s when the offer is not COMPLETED', async () => {
        offersFindFirst.mockResolvedValue({ ...OFFER, status: 'PROCESSING' });
        await expect(svc().applyCorrections('o1', 'u1', [
            { field: 'extractedData.companyName', correctedValue: 'Globex' },
        ])).rejects.toMatchObject({ code: 'OFFER_NOT_READY' });
    });
});

// §9.10
describe('CorrectionService.getCorrections', () => {
    it('returns the audit rows ordered by createdAt desc', async () => {
        const rows = [{ id: 'c2' }, { id: 'c1' }];
        correctionsFindMany.mockResolvedValue(rows);
        const r = await svc().getCorrections('o1', 'u1');
        expect(r).toBe(rows);
        const arg = correctionsFindMany.mock.calls[0][0];
        expect(arg).toHaveProperty('orderBy');
    });
});

// §9.11
describe('correctable-fields allowlist + setNestedValue', () => {
    it('contains exactly the six paths', () => {
        expect(CORRECTABLE_PATHS).toEqual([
            'extractedData.companyName',
            'extractedData.role',
            'extractedData.location',
            'extractedData.compensation.totalCTC',
            'extractedData.noticePeriod',
            'extractedData.probationPeriod',
        ]);
    });

    it('setNestedValue writes a deep leaf on a clone without mutating the input', () => {
        const input = { compensation: { totalCTC: 1, currency: 'INR' } };
        const out = setNestedValue(input, 'compensation.totalCTC', 999);
        expect(out.compensation.totalCTC).toBe(999);
        expect(input.compensation.totalCTC).toBe(1); // not mutated
        expect(out.compensation.currency).toBe('INR'); // siblings preserved
    });

    it('validateCorrection refuses a non-allowlisted path', () => {
        expect(() => validateCorrection('extractedData.__proto__.x', 'v')).toThrow(AppError);
    });

    it('validateCorrection passes a null text field and a non-negative number', () => {
        expect(validateCorrection('extractedData.role', null)).toBeNull();
        expect(validateCorrection('extractedData.compensation.totalCTC', 500000)).toBe(500000);
    });
});

// §9.12 — migration ordering (static text check; no DB executed here).
describe('migration 0009', () => {
    // ponytail: this is a text check, not an executed migration. Ceiling: it proves ordering,
    // not that the SQL runs. Upgrade path: real-Postgres verification is a pre-deploy step.
    it('deletes duplicates before creating the unique index', () => {
        const sql = readFileSync(
            fileURLToPath(new URL('../../../drizzle/0009_corrections_unique_field.sql', import.meta.url)),
            'utf8',
        );
        const deleteAt = sql.indexOf('DELETE FROM "corrections"');
        const indexAt = sql.indexOf('CREATE UNIQUE INDEX "uq_corrections_offer_field"');
        expect(deleteAt).toBeGreaterThanOrEqual(0);
        expect(indexAt).toBeGreaterThan(deleteAt);
    });
});
