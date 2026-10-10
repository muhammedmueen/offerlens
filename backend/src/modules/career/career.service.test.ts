import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { PLANS } from '@/config/plans.js';
import { QuotaExceededError } from '@/shared/errors/app-error.js';

// Career path cap + cache (task 4.3): a cache hit must never consume the daily career cap.

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', AI_PROVIDER: 'mock' }; } }));

const offersFindFirst = vi.fn();
const analysesFindFirst = vi.fn();
vi.mock('@/db/index.js', () => ({
    db: {
        query: {
            offers: { findFirst: (...a: unknown[]) => offersFindFirst(...a) },
            analyses: { findFirst: (...a: unknown[]) => analysesFindFirst(...a) },
        },
    },
}));

const cacheGetJson = vi.fn();
const cacheSetJson = vi.fn();
vi.mock('@/shared/cache.js', () => ({
    cacheGetJson: (...a: unknown[]) => cacheGetJson(...a),
    cacheSetJson: (...a: unknown[]) => cacheSetJson(...a),
    cacheDelete: vi.fn(),
}));

const reserve = vi.fn();
const release = vi.fn();
vi.mock('@/modules/quota/quota.service.js', () => ({
    reserve: (...a: unknown[]) => reserve(...a),
    release: (...a: unknown[]) => release(...a),
}));

const generateCareerPath = vi.fn();
const createAiProvider = vi.fn(() => ({ generateCareerPath }));
vi.mock('@/providers/ai/ai.factory.js', () => ({ createAiProvider: (...a: unknown[]) => (createAiProvider as any)(...a) }));

let CareerService: typeof import('./career.service.js').CareerService;
let careerPathCacheKey: typeof import('./career.service.js').careerPathCacheKey;
beforeAll(async () => {
    ({ CareerService, careerPathCacheKey } = await import('./career.service.js'));
}, 30_000);

const fastify = { log: { info() {}, warn() {}, error() {} } } as any;
const reservation = { subjectType: 'user', subjectId: 'u1', feature: 'career', day: '2026-10-10', count: 1 };
const path = { timeline: [{ year: 1, title: 'Senior', focus: 'x', salaryRange: 'y' }], skillsToLearn: [], potentialRoles: [] };

beforeEach(() => {
    for (const f of [offersFindFirst, analysesFindFirst, cacheGetJson, cacheSetJson, reserve, release, generateCareerPath, createAiProvider]) f.mockClear();
    offersFindFirst.mockResolvedValue({ id: 'o1', userId: 'u1', guestId: 'g1', status: 'COMPLETED' });
    analysesFindFirst.mockResolvedValue({ extractedData: { role: 'Engineer' } });
    cacheGetJson.mockResolvedValue(null);
    cacheSetJson.mockResolvedValue(true);
    reserve.mockResolvedValue(reservation);
    generateCareerPath.mockResolvedValue(path);
});

describe('CareerService.generatePath', () => {
    it('a cache hit returns the cached path, reserves nothing, calls no AI', async () => {
        cacheGetJson.mockResolvedValue(path);
        const r = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(r).toEqual(path);
        expect(cacheGetJson).toHaveBeenCalledWith(careerPathCacheKey('o1'));
        expect(reserve).not.toHaveBeenCalled();
        expect(createAiProvider).not.toHaveBeenCalled();
    });

    it('a miss reserves once against the user and caches the result', async () => {
        await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(reserve).toHaveBeenCalledTimes(1);
        expect(reserve.mock.calls[0][1]).toEqual({ type: 'user', id: 'u1', tier: PLANS.free });
        expect(reserve.mock.calls[0][2]).toBe('career');
        expect(cacheSetJson).toHaveBeenCalledTimes(1);
        expect(cacheSetJson.mock.calls[0][0]).toBe('career-path:v1:o1');
        expect(release).not.toHaveBeenCalled();
    });

    it('a provider soft error ({ error }) is released and not cached', async () => {
        generateCareerPath.mockResolvedValue({ timeline: [], skillsToLearn: [], potentialRoles: [], error: 'AI down' });
        await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
        expect(cacheSetJson).not.toHaveBeenCalled();
    });

    it('a provider throw is released and rethrown', async () => {
        const boom = new Error('boom');
        generateCareerPath.mockRejectedValue(boom);
        await expect(new CareerService(fastify).generatePath('o1', 'u1', PLANS.free)).rejects.toBe(boom);
        expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
        expect(cacheSetJson).not.toHaveBeenCalled();
    });

    it('over the cap: the 429 propagates and no AI call is made', async () => {
        const err = new QuotaExceededError({ feature: 'career', limit: 10, used: 10, tierId: 'free', resetAt: new Date(), now: new Date() });
        reserve.mockRejectedValue(err);
        await expect(new CareerService(fastify).generatePath('o1', 'u1', PLANS.free)).rejects.toBe(err);
        expect(createAiProvider).not.toHaveBeenCalled();
    });
});
