import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';

// The query builder is replaced by a recorder: every chained call returns the chain, awaiting it
// yields the next queued result, and `orderBy` arguments are kept so the generated SQL can be
// checked without a database.
const h = vi.hoisted(() => ({ results: [] as unknown[][], orderBy: [] as unknown[], selects: [] as unknown[] }));
vi.mock('@/db/index.js', () => {
    const chain: Record<string, unknown> = {};
    for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'limit', 'offset']) chain[m] = () => chain;
    chain.orderBy = (...args: unknown[]) => { h.orderBy = args; return chain; };
    chain.then = (resolve: (v: unknown) => void) => resolve(h.results.shift());
    return { db: { select: (fields: unknown) => { h.selects.push(fields); return chain; } } };
});

const { UserService, toOfferListItem } = await import('./user.service.js');
const service = new UserService();
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as SQL).sql;

beforeEach(() => { h.results = []; h.orderBy = []; h.selects = []; });

const row = (over: Record<string, unknown>) => ({
    id: 'o1', status: 'COMPLETED', createdAt: new Date('2026-10-01'), score: 72, scoreLabel: 'good',
    userContext: { role: 'Typed Role', city: 'Pune' }, extractedData: { companyName: 'Acme', role: 'Backend Engineer' },
    ...over,
});

describe('toOfferListItem', () => {
    it('returns company and role from the analysis, and drops the extractedData blob', () => {
        const item = toOfferListItem(row({}));
        expect(item).toMatchObject({ company: 'Acme', role: 'Backend Engineer' });
        expect(item).not.toHaveProperty('extractedData');
    });

    it('falls back to the role the user typed, and to null when nothing was found', () => {
        expect(toOfferListItem(row({ extractedData: { companyName: null, role: null } }))).toMatchObject({ company: null, role: 'Typed Role' });
        expect(toOfferListItem(row({ extractedData: null, userContext: null }))).toMatchObject({ company: null, role: null });
    });
});

describe('getOfferHistory', () => {
    const run = async (sort: string) => {
        h.results = [[row({})], [{ total: 25 }]];
        return service.getOfferHistory('u1', { page: 1, limit: 20, sort });
    };

    it('returns company/role per offer, no rawText, and the pagination block', async () => {
        const res = await run('createdAt');
        expect(res.offers[0]).toMatchObject({ id: 'o1', company: 'Acme', role: 'Backend Engineer' });
        expect(res.offers[0]).not.toHaveProperty('extractedData');
        expect(res.offers[0]).not.toHaveProperty('rawText');
        expect(res.pagination).toMatchObject({ total: 25, totalPages: 2 });
        // rawText was a full offer letter per row; it must not be selected at all.
        expect(Object.keys(h.selects[0] as object)).not.toContain('rawText');
    });

    it('sorts by score with unanalysed offers last, then newest, then id as a stable tiebreak', async () => {
        await run('score');
        expect(h.orderBy.map(render)).toEqual([
            expect.stringMatching(/"score" DESC NULLS LAST/),
            expect.stringMatching(/"created_at" desc/),
            expect.stringMatching(/"id" desc/),
        ]);
    });

    it('sorts by date with the same id tiebreak', async () => {
        await run('createdAt');
        expect(h.orderBy.map(render)).toEqual([
            expect.stringMatching(/"created_at" desc/),
            expect.stringMatching(/"id" desc/),
        ]);
    });
});

describe('getDashboardStats', () => {
    it('returns bestScore alongside the average', async () => {
        h.results = [[{ total: 3 }], [{ avg: '72.4', best: 91 }], [{ score: 91, scoreLabel: 'excellent' }, { score: 54, scoreLabel: 'fair' }]];
        const stats = await service.getDashboardStats('u1');
        expect(stats).toMatchObject({ totalOffers: 3, averageScore: 72, bestScore: 91, completedAnalyses: 2 });
    });

    it('returns null average and best for a user with no analyses', async () => {
        h.results = [[{ total: 1 }], [{ avg: null, best: null }], []];
        const stats = await service.getDashboardStats('u1');
        expect(stats).toMatchObject({ averageScore: null, bestScore: null, completedAnalyses: 0 });
    });
});
