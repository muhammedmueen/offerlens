import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { PLANS } from '@/config/plans.js';
import { QuotaExceededError } from '@/shared/errors/app-error.js';

// The quota call-count invariant (NEG-1): the user is charged exactly once for a validated
// personalized script (reserve 1 / release 0) and net-zero on every failure/garbage/thin/over-cap
// path (reserve 0, or reserve 1 + release 1). DB-free — db, config, quota and the AI factory are
// all mocked following the career.service.test.ts pattern.
//
// ponytail: this stubs createAiProvider rather than exercising the base provider's Zod validation
// end to end. Ceiling: it does not prove the schema itself; that is negotiation-schema.test.ts's
// job. Keeping the two concerns apart keeps each test's mocks honest.

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

const reserve = vi.fn();
const release = vi.fn();
vi.mock('@/modules/quota/quota.service.js', () => ({
    reserve: (...a: unknown[]) => reserve(...a),
    release: (...a: unknown[]) => release(...a),
}));

const generateNegotiationScript = vi.fn();
const createAiProvider = vi.fn(() => ({ generateNegotiationScript }));
vi.mock('@/providers/ai/ai.factory.js', () => ({ createAiProvider: (...a: unknown[]) => (createAiProvider as any)(...a) }));

let NegotiationService: typeof import('./negotiation.service.js').NegotiationService;
beforeAll(async () => {
    ({ NegotiationService } = await import('./negotiation.service.js'));
}, 30_000);

const fastify = { log: { info() {}, warn() {}, error() {} } } as any;
const reservation = { subjectType: 'user', subjectId: 'u1', feature: 'negotiation', day: '2026-10-10', count: 1 };
const extractedData = {
    companyName: 'Halcyon Labs',
    role: 'Product Designer',
    compensation: { currency: 'INR', baseSalary: null, totalCTC: 1_500_000 },
};

beforeEach(() => {
    for (const f of [offersFindFirst, analysesFindFirst, reserve, release, generateNegotiationScript, createAiProvider]) f.mockClear();
    offersFindFirst.mockResolvedValue({ id: 'o1', userId: 'u1', guestId: 'g1', status: 'COMPLETED' });
    analysesFindFirst.mockResolvedValue({ extractedData, salaryComparison: null, negotiationSuggestions: [] });
    reserve.mockResolvedValue(reservation);
    release.mockResolvedValue(undefined);
});

describe('NegotiationService.generateScript — quota call-count invariant', () => {
    it('valid script → personalized, charged exactly once, not released', async () => {
        generateNegotiationScript.mockResolvedValue({ subject: 'Re: offer', body: 'Dear team' });
        const r = await new NegotiationService(fastify).generateScript('o1', 'u1', PLANS.free);

        expect(r.type).toBe('personalized');
        expect(r.subject).toBe('Re: offer');
        expect(r.body).toBe('Dear team');
        expect(reserve).toHaveBeenCalledTimes(1);
        expect(release).not.toHaveBeenCalled();
    });

    it('AI throws → template, charged then released with the exact reservation (net zero)', async () => {
        generateNegotiationScript.mockRejectedValue(new Error('provider down'));
        const r: any = await new NegotiationService(fastify).generateScript('o1', 'u1', PLANS.free);

        expect(r.type).toBe('template');
        expect(r.note).toBeTruthy();
        expect(typeof r.subject).toBe('string');
        expect(r.subject.length).toBeGreaterThan(0);
        expect(typeof r.body).toBe('string');
        expect(r.body.length).toBeGreaterThan(0);
        expect(reserve).toHaveBeenCalledTimes(1);
        expect(release).toHaveBeenCalledTimes(1);
        // The exact value reserve returned goes back — honours the null-on-unlimited contract.
        expect(release.mock.calls[0][1]).toBe(reservation);
    });

    it('thin data → template, never charged', async () => {
        analysesFindFirst.mockResolvedValue({
            extractedData: { companyName: null }, salaryComparison: null, negotiationSuggestions: [],
        });
        const r = await new NegotiationService(fastify).generateScript('o1', 'u1', PLANS.free);

        expect(r.type).toBe('template');
        expect(reserve).not.toHaveBeenCalled();
        expect(release).not.toHaveBeenCalled();
    });

    it('over quota → 429 propagates, no template, no release, AI never called', async () => {
        const err = new QuotaExceededError({ feature: 'negotiation', limit: 10, used: 10, tierId: 'free', resetAt: new Date(), now: new Date() });
        reserve.mockRejectedValue(err);
        await expect(new NegotiationService(fastify).generateScript('o1', 'u1', PLANS.free)).rejects.toBe(err);

        expect(release).not.toHaveBeenCalled();
        expect(generateNegotiationScript).not.toHaveBeenCalled();
    });
});
