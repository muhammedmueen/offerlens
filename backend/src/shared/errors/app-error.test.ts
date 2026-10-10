import { describe, it, expect } from 'vitest';
import { AppError, QuotaExceededError } from './app-error.js';

describe('QuotaExceededError', () => {
    const now = new Date('2026-10-10T17:30:00.000Z');
    const resetAt = new Date('2026-10-10T18:30:00.000Z');

    it('analysis uses UPLOAD_LIMIT_EXCEEDED with the full details shape', () => {
        const err = new QuotaExceededError({ feature: 'analysis', limit: 3, used: 3, tierId: 'free', resetAt, now });
        expect(err).toBeInstanceOf(AppError);
        expect(err.statusCode).toBe(429);
        expect(err.code).toBe('UPLOAD_LIMIT_EXCEEDED');
        expect(err.details).toEqual({
            feature: 'analysis',
            limit: 3,
            used: 3,
            remaining: 0,
            resetAt: '2026-10-10T18:30:00.000Z',
            plan: 'free',
        });
        expect(err.retryAfterSeconds).toBe(3600);
    });

    it.each(['career', 'negotiation', 'autofill'] as const)('%s uses QUOTA_EXCEEDED', (feature) => {
        const err = new QuotaExceededError({ feature, limit: 10, used: 10, tierId: 'guest', resetAt, now });
        expect(err.code).toBe('QUOTA_EXCEEDED');
        expect(err.details.plan).toBe('guest');
    });
});
