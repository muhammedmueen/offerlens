import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { FEATURE_GATES, GUEST, PLANS, type Tier } from '@/config/plans.js';
import { errorHandler } from './error-handler.js';

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({ db: {} }));

const { requireFeature } = await import('./require-feature.js');

async function call(tier: Tier) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/x', { preHandler: [requireFeature('careerPath', async () => tier)] }, async () => ({ ok: true }));
    const res = await app.inject({ method: 'GET', url: '/x' });
    await app.close();
    return res;
}

describe('requireFeature', () => {
    it('passes when the plan has the gate open', async () => {
        const res = await call(PLANS.free);
        expect(res.statusCode).toBe(200);
    });

    it('a closed gate is 403 FEATURE_NOT_IN_PLAN with feature and plan', async () => {
        const locked: Tier = { ...PLANS.free, features: { ...PLANS.free.features, careerPath: false } };
        const res = await call(locked);
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatchObject({
            code: 'FEATURE_NOT_IN_PLAN',
            details: { feature: 'careerPath', plan: 'free' },
        });
    });

    it('free and unlimited pass all four gates; guest is locked', async () => {
        for (const gate of FEATURE_GATES) {
            const req = {} as any;
            await expect(requireFeature(gate, async () => PLANS.free)(req)).resolves.toBeUndefined();
            await expect(requireFeature(gate, async () => PLANS.unlimited)(req)).resolves.toBeUndefined();
            await expect(requireFeature(gate, async () => GUEST)(req)).rejects.toMatchObject({ statusCode: 403 });
        }
    });

    it('exposes the gate it checks', () => {
        expect(requireFeature('comparison').featureGate).toBe('comparison');
    });
});
