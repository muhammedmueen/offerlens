import { describe, it, expect } from 'vitest';
import { FEATURE_GATES, GUEST, PLANS, canSelectModel, planFor } from './plans.js';

describe('planFor', () => {
    it('resolves known plans', () => {
        expect(planFor('free')).toBe(PLANS.free);
        expect(planFor('unlimited')).toBe(PLANS.unlimited);
    });

    it('falls back to free for null or unknown', () => {
        expect(planFor(null)).toBe(PLANS.free);
        expect(planFor(undefined)).toBe(PLANS.free);
        expect(planFor('bogus')).toBe(PLANS.free);
    });
});

describe('PLANS', () => {
    it('guest gets 1 analysis and 30 autofills a day', () => {
        expect(GUEST.id).toBe('guest');
        expect(GUEST.daily.analysis).toBe(1);
        expect(GUEST.daily.autofill).toBe(30);
    });

    it('free is 3/30/10/10 with no model selection', () => {
        expect(PLANS.free.daily).toEqual({ analysis: 3, autofill: 30, career: 10, negotiation: 10 });
        expect(PLANS.free.allowModelSelection).toBe(false);
    });

    it('unlimited has no caps and may select a model', () => {
        expect(PLANS.unlimited.daily).toEqual({ analysis: null, autofill: null, career: null, negotiation: null });
        expect(PLANS.unlimited.allowModelSelection).toBe(true);
    });

    it('every feature gate is open on free and unlimited (nothing changes at launch)', () => {
        for (const gate of FEATURE_GATES) {
            expect(PLANS.free.features[gate]).toBe(true);
            expect(PLANS.unlimited.features[gate]).toBe(true);
        }
    });
});

describe('canSelectModel', () => {
    it.each([
        [PLANS.free, 'production', false],
        [PLANS.unlimited, 'production', true],
        [GUEST, 'development', true],
        [PLANS.free, 'test', true],
    ] as const)('%s in %s → %s', (tier, env, expected) => {
        expect(canSelectModel(tier, env)).toBe(expected);
    });
});
