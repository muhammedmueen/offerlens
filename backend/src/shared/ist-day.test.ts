import { describe, it, expect } from 'vitest';
import { istDayWindow, retryAfterSeconds } from './ist-day.js';

describe('istDayWindow', () => {
    it('one millisecond before 00:00 IST is still the old day', () => {
        const w = istDayWindow(new Date('2026-10-10T18:29:59.999Z'));
        expect(w.day).toBe('2026-10-10');
        expect(w.resetAt.toISOString()).toBe('2026-10-10T18:30:00.000Z');
    });

    it('18:29:59Z is the old day', () => {
        expect(istDayWindow(new Date('2026-10-10T18:29:59Z')).day).toBe('2026-10-10');
    });

    it('00:00 IST (18:30:00Z) starts the next day', () => {
        const w = istDayWindow(new Date('2026-10-10T18:30:00.000Z'));
        expect(w.day).toBe('2026-10-11');
        expect(w.resetAt.toISOString()).toBe('2026-10-11T18:30:00.000Z');
    });

    it('UTC midnight is 05:30 IST the same day', () => {
        expect(istDayWindow(new Date('2026-10-10T00:00:00Z')).day).toBe('2026-10-10');
    });

    it('rolls the year over', () => {
        expect(istDayWindow(new Date('2026-12-31T18:30:00Z')).day).toBe('2027-01-01');
    });

    it('handles a leap day', () => {
        expect(istDayWindow(new Date('2028-02-28T18:30:00Z')).day).toBe('2028-02-29');
    });
});

describe('retryAfterSeconds', () => {
    const reset = new Date('2026-10-10T18:30:00.000Z');

    it('1 s before reset is 1', () => {
        expect(retryAfterSeconds(reset, new Date(reset.getTime() - 1000))).toBe(1);
    });

    it('exactly at reset is floored to 1', () => {
        expect(retryAfterSeconds(reset, reset)).toBe(1);
    });

    it('1 h before is 3600', () => {
        expect(retryAfterSeconds(reset, new Date(reset.getTime() - 3_600_000))).toBe(3600);
    });
});
