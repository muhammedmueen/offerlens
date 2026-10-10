import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { errorHandler } from './error-handler.js';
import { rateLimitErrorResponse } from './rate-limiter.js';
import { AppError, QuotaExceededError } from '@/shared/errors/app-error.js';

// Honest 429s (task 4.4): quota errors carry their numbers and a Retry-After, and stay
// distinguishable from the rate-limit plugin's 429.

const now = new Date('2026-10-10T17:30:00.000Z');
const resetAt = new Date('2026-10-10T18:30:00.000Z');

async function inject(thrown: Error) {
    const app = Fastify();
    app.setErrorHandler(errorHandler);
    app.get('/x', async () => { throw thrown; });
    const res = await app.inject({ method: 'GET', url: '/x' });
    await app.close();
    return res;
}

describe('errorHandler: quota 429', () => {
    it('analysis: UPLOAD_LIMIT_EXCEEDED with details and Retry-After', async () => {
        const err = new QuotaExceededError({ feature: 'analysis', limit: 1, used: 1, tierId: 'guest', resetAt, now });
        const res = await inject(err);
        expect(res.statusCode).toBe(429);
        expect(res.headers['retry-after']).toBe(String(err.retryAfterSeconds));
        expect(res.headers['retry-after']).toBe('3600');
        expect(res.json().error.code).toBe('UPLOAD_LIMIT_EXCEEDED');
        expect(res.json().error.details).toEqual({
            feature: 'analysis', limit: 1, used: 1, remaining: 0, resetAt: '2026-10-10T18:30:00.000Z', plan: 'guest',
        });
    });

    it('career: QUOTA_EXCEEDED', async () => {
        const res = await inject(new QuotaExceededError({ feature: 'career', limit: 10, used: 10, tierId: 'free', resetAt, now }));
        expect(res.statusCode).toBe(429);
        expect(res.json().error.code).toBe('QUOTA_EXCEEDED');
        expect(res.json().error.details.feature).toBe('career');
        expect(res.headers['retry-after']).toBeDefined();
    });

    it('other 4xx AppErrors still pass details and set no Retry-After', async () => {
        const res = await inject(new AppError('GUEST_RESTRICTED', 'nope', 403, { why: 'guest' }));
        expect(res.statusCode).toBe(403);
        expect(res.json().error).toMatchObject({ code: 'GUEST_RESTRICTED', details: { why: 'guest' } });
        expect(res.headers['retry-after']).toBeUndefined();
    });
});

describe('errorHandler: rate-limit plugin 429', () => {
    it('keeps RATE_LIMIT_EXCEEDED and carries Retry-After', async () => {
        const app = Fastify();
        app.setErrorHandler(errorHandler);
        await app.register(rateLimit, { global: true, max: 1, timeWindow: '1 minute', errorResponseBuilder: rateLimitErrorResponse });
        app.get('/x', async () => ({ ok: true }));
        await app.ready();

        expect((await app.inject({ method: 'GET', url: '/x' })).statusCode).toBe(200);
        const res = await app.inject({ method: 'GET', url: '/x' });
        await app.close();

        expect(res.statusCode).toBe(429);
        expect(res.json().error.code).toBe('RATE_LIMIT_EXCEEDED');
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });
});
