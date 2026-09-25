import { describe, it, expect } from 'vitest';
import { UNFINISHED_STATUSES, stuckBefore, STUCK_FAILURE_REASON } from './reap.js';
import { STUCK_OFFER_TIMEOUT_MS, ANALYSIS_TIMEOUT_MS } from '@/config/constants.js';

/**
 * What can actually go wrong in a reaper is the predicate, not the UPDATE. Two failure modes
 * matter and both are asserted here:
 *
 *   - reaping too much: a terminal status in the reapable set would overwrite a real verdict
 *   - reaping too soon: a cutoff at or below the per-call budget cancels live work
 *
 * The query itself is one conditional UPDATE with no branches; it was verified against the
 * live development database with a seeded stuck row (see the plan doc), which is a more
 * honest check of SQL than a mock would be.
 */

describe('reapable statuses', () => {
    it('covers both ways an offer can be left unfinished', () => {
        // PROCESSING is the worker-died case, QUEUED the worker-never-started case.
        expect([...UNFINISHED_STATUSES]).toEqual(['QUEUED', 'PROCESSING']);
    });

    it('never includes a terminal status', () => {
        // The bug this guards against is catastrophic rather than untidy: a COMPLETED offer
        // swept into the reapable set loses an analysis the user is already looking at.
        expect(UNFINISHED_STATUSES).not.toContain('COMPLETED');
        expect(UNFINISHED_STATUSES).not.toContain('FAILED');
    });
});

describe('stuckBefore', () => {
    it('subtracts the timeout from the given instant', () => {
        const now = new Date('2026-09-25T12:00:00.000Z');
        expect(stuckBefore(now, 60_000).toISOString()).toBe('2026-09-25T11:59:00.000Z');
    });

    it('defaults to the configured stuck timeout', () => {
        const now = new Date('2026-09-25T12:00:00.000Z');
        expect(now.getTime() - stuckBefore(now).getTime()).toBe(STUCK_OFFER_TIMEOUT_MS);
    });

    it('does not mutate the instant it is given', () => {
        const now = new Date('2026-09-25T12:00:00.000Z');
        stuckBefore(now);
        expect(now.toISOString()).toBe('2026-09-25T12:00:00.000Z');
    });

    it('leaves room for an analysis that walks the whole fallback chain', () => {
        // The plan suggested reusing ANALYSIS_TIMEOUT_MS as the reap threshold. A cutoff at
        // the per-call budget would cancel an upload that spent it on OCR, a 503, and a
        // retry — work that was still going to succeed.
        expect(STUCK_OFFER_TIMEOUT_MS).toBeGreaterThan(ANALYSIS_TIMEOUT_MS);
    });
});

describe('failure reason', () => {
    it('carries no machine prefix, because the frontend would print it', () => {
        // ProcessingPage.getErrorMessage strips RATE_LIMIT:/INVALID_REQUEST:/AI_ERROR: and
        // falls through to printing anything else verbatim.
        expect(STUCK_FAILURE_REASON).not.toMatch(/^[A-Z_]+:/);
    });

    it('tells the user what to do next', () => {
        expect(STUCK_FAILURE_REASON.toLowerCase()).toContain('again');
    });
});
