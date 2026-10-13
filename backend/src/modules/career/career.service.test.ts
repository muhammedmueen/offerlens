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

const getProgression = vi.fn();
vi.mock('@/modules/salary/salary.service.js', () => ({
    SalaryService: class { getProgression = (...a: unknown[]) => getProgression(...a); },
}));

const generateCareerPath = vi.fn();
const createAiProvider = vi.fn(() => ({ generateCareerPath }));
vi.mock('@/providers/ai/ai.factory.js', () => ({ createAiProvider: (...a: unknown[]) => (createAiProvider as any)(...a) }));
let CareerService: typeof import('./career.service.js').CareerService;
let careerPathCacheKey: typeof import('./career.service.js').careerPathCacheKey;
let toNarrative: typeof import('./career.service.js').toNarrative;
beforeAll(async () => {
    ({ CareerService, careerPathCacheKey, toNarrative } = await import('./career.service.js'));
}, 30_000);

const fastify = { log: { info() {}, warn() {}, error() {} } } as any;
const reservation = { subjectType: 'user', subjectId: 'u1', feature: 'career', day: '2026-10-10', count: 1 };
const path = { timeline: [{ year: 1, title: 'Senior', focus: 'x' }], skillsToLearn: [], potentialRoles: [] };
const progression = { applicable: true, cells: [] };

beforeEach(() => {
    for (const f of [offersFindFirst, analysesFindFirst, cacheGetJson, cacheSetJson, reserve, release, generateCareerPath, createAiProvider, getProgression]) f.mockClear();
    offersFindFirst.mockResolvedValue({ id: 'o1', userId: 'u1', guestId: 'g1', status: 'COMPLETED' });
    analysesFindFirst.mockResolvedValue({ extractedData: { role: 'Engineer' } });
    cacheGetJson.mockResolvedValue(null);
    cacheSetJson.mockResolvedValue(true);
    reserve.mockResolvedValue(reservation);
    generateCareerPath.mockResolvedValue(path);
    getProgression.mockResolvedValue(progression);
});

describe('CareerService.generatePath', () => {
    it('a cache hit returns the cached narrative plus a fresh progression, reserves nothing, calls no AI', async () => {
        cacheGetJson.mockResolvedValue(path);
        const r = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(r).toEqual({ ...path, progression });
        expect(cacheGetJson).toHaveBeenCalledWith(careerPathCacheKey('o1'));
        expect(careerPathCacheKey('o1')).toBe('career-path:v2:o1');
        expect(getProgression).toHaveBeenCalledTimes(1);
        expect(reserve).not.toHaveBeenCalled();
        expect(createAiProvider).not.toHaveBeenCalled();
    });

    it('a miss reserves once against the user, caches the NARRATIVE only, and returns it with the progression', async () => {
        const r = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(reserve).toHaveBeenCalledTimes(1);
        expect(reserve.mock.calls[0][1]).toEqual({ type: 'user', id: 'u1', tier: PLANS.free });
        expect(reserve.mock.calls[0][2]).toBe('career');
        expect(cacheSetJson).toHaveBeenCalledTimes(1);
        expect(cacheSetJson.mock.calls[0][0]).toBe('career-path:v2:o1');
        expect(cacheSetJson.mock.calls[0][1]).toEqual(path);
        expect(cacheSetJson.mock.calls[0][1]).not.toHaveProperty('progression');
        expect(r).toEqual({ ...path, progression });
        expect(release).not.toHaveBeenCalled();
    });

    it('passes the letter\'s role, currency and city (letter wins over the form), and the form experience level', async () => {
        analysesFindFirst.mockResolvedValue({ extractedData: { role: 'Backend Engineer', location: 'Pune', compensation: { currency: 'INR' } } });
        offersFindFirst.mockResolvedValue({ id: 'o1', userId: 'u1', guestId: 'g1', status: 'COMPLETED', userContext: { city: 'Mumbai', experienceLevel: 'Mid-Level (3-5 yrs)' } });
        await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(getProgression).toHaveBeenCalledWith({ role: 'Backend Engineer', location: 'Pune', currency: 'INR', experienceLevel: 'Mid-Level (3-5 yrs)' });
    });

    it('feeds the AI the extracted industry and company type, not hardcoded ones', async () => {
        analysesFindFirst.mockResolvedValue({ extractedData: { role: 'Teacher', industry: 'Education', companyType: 'ngo' } });
        await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(generateCareerPath).toHaveBeenCalledWith({ role: 'Teacher', industry: 'Education', companyType: 'ngo' });
    });

    it('drops extra model keys, including a stray salaryRange', async () => {
        generateCareerPath.mockResolvedValue({
            timeline: [{ year: 1, title: 'T', focus: 'f', salaryRange: '99 LPA', ctc: 1 }],
            skillsToLearn: ['a', 3], potentialRoles: ['b'], salaryBands: ['x'],
        });
        const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(r.timeline[0]).toEqual({ year: 1, title: 'T', focus: 'f' });
        expect(r.skillsToLearn).toEqual(['a']);
        expect(r).not.toHaveProperty('salaryBands');
        expect(cacheSetJson.mock.calls[0][1]).not.toHaveProperty('salaryBands');
    });

    it('a provider soft error ({ error }) is released, not cached, and still returns the progression', async () => {
        generateCareerPath.mockResolvedValue({ timeline: [], skillsToLearn: [], potentialRoles: [], error: 'AI down' });
        const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
        expect(cacheSetJson).not.toHaveBeenCalled();
        expect(r).toMatchObject({ error: 'AI down', timeline: [], progression });
    });

    it.each([['an array', []], ['a string', 'oops'], ['no timeline', { skillsToLearn: ['a'] }], ['null', null]])(
        'unusable output (%s) is released, not cached, and returns the error shape plus the progression',
        async (_name, output) => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
            generateCareerPath.mockResolvedValue(output);
            const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
            warn.mockRestore();
            expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
            expect(cacheSetJson).not.toHaveBeenCalled();
            expect(r).toMatchObject({ timeline: [], skillsToLearn: [], potentialRoles: [], progression });
            expect(r.error).toBeTruthy();
        },
    );

    it.each([
        ['a milestone title', { timeline: [{ year: 1, title: 'Engineer on ₹18 LPA', focus: 'x' }], skillsToLearn: [], potentialRoles: [] }],
        ['a milestone focus', { timeline: [{ year: 3, title: 'Senior', focus: 'a 30% salary hike' }], skillsToLearn: [], potentialRoles: [] }],
        ['a skill', { timeline: [{ year: 1, title: 'T', focus: 'f' }], skillsToLearn: ['negotiate Rs. 12,00,000'], potentialRoles: [] }],
        ['a role', { timeline: [{ year: 1, title: 'T', focus: 'f' }], skillsToLearn: [], potentialRoles: ['Lead earning 1.5 crore'] }],
    ])('a narrative with a pay figure in %s is dropped: released, not cached, progression kept', async (_name, output) => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
        generateCareerPath.mockResolvedValue(output);
        const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        warn.mockRestore();
        expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
        expect(cacheSetJson).not.toHaveBeenCalled();
        expect(r).toMatchObject({ timeline: [], skillsToLearn: [], potentialRoles: [], progression });
        expect(r.error).toBeTruthy();
    });

    it('a clean narrative with years, levels and team sizes is not dropped', async () => {
        generateCareerPath.mockResolvedValue({
            timeline: [{ year: 3, title: 'Senior Engineer (L5)', focus: 'Lead a team of 8 by 2027' }],
            skillsToLearn: ['System Design'], potentialRoles: ['Staff role in 5 years'],
        });
        const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(r.error).toBeUndefined();
        expect(cacheSetJson).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it('a progression lookup_error does not fail the request', async () => {
        getProgression.mockResolvedValue({ applicable: false, reason: 'lookup_error' });
        const r: any = await new CareerService(fastify).generatePath('o1', 'u1', PLANS.free);
        expect(r.timeline).toHaveLength(1);
        expect(r.progression).toEqual({ applicable: false, reason: 'lookup_error' });
    });

    it('a provider throw is released and rethrown', async () => {
        const boom = new Error('boom');
        generateCareerPath.mockRejectedValue(boom);
        await expect(new CareerService(fastify).generatePath('o1', 'u1', PLANS.free)).rejects.toBe(boom);
        expect(release).toHaveBeenCalledWith(expect.anything(), reservation);
        expect(cacheSetJson).not.toHaveBeenCalled();
    });

    it('over the cap: the 429 propagates and neither the AI nor the progression runs', async () => {
        const err = new QuotaExceededError({ feature: 'career', limit: 10, used: 10, tierId: 'free', resetAt: new Date(), now: new Date() });
        reserve.mockRejectedValue(err);
        await expect(new CareerService(fastify).generatePath('o1', 'u1', PLANS.free)).rejects.toBe(err);
        expect(createAiProvider).not.toHaveBeenCalled();
        expect(getProgression).not.toHaveBeenCalled();
    });
});

describe('toNarrative', () => {
    it('keeps only year/title/focus per milestone and string entries in the lists', () => {
        expect(toNarrative({ timeline: [null, { year: 1, title: 'a', focus: 'b', x: 1 }], skillsToLearn: 'nope', potentialRoles: ['r'] }))
            .toEqual({ timeline: [{ year: 1, title: 'a', focus: 'b' }], skillsToLearn: [], potentialRoles: ['r'] });
    });
});
