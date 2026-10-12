import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test' }; } }));
vi.mock('@/db/index.js', () => ({ db: {} }));
vi.mock('@/shared/cache.js', () => ({ cached: async () => null, cacheDelete: async () => undefined, getRedis: () => ({}) }));

const { salaryRoutes } = await import('./salary.routes.js');
const { RATE_LIMITS } = await import('@/config/constants.js');

describe('salary routes rate limits (design 4.7)', () => {
    it('GET /salaries/stats carries a 30/min per-route limit', async () => {
        const seen: Record<string, any> = {};
        const app = Fastify();
        app.addHook('onRoute', (r) => { seen[`${r.method} ${r.url}`] = r; });
        await app.register(salaryRoutes);

        expect(RATE_LIMITS.salaryStats).toEqual({ max: 30, window: '1 minute' });
        expect(seen['GET /salaries/stats'].config.rateLimit).toMatchObject({ max: 30, timeWindow: '1 minute' });
    });
});
