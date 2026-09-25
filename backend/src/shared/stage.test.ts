import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { optionalStage } from './stage.js';

/**
 * The behaviour under test is "an expensive, already-completed AI call is not thrown away
 * because a pure function downstream had a bug". So the assertions are: the failure does not
 * propagate, the fallback is what comes back, and the failure is loud in the log rather than
 * swallowed silently.
 */

let error: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    error = vi.spyOn(console, 'error').mockImplementation(() => { });
});

afterEach(() => {
    error.mockRestore();
});

describe('optionalStage', () => {
    it('returns the computed value when nothing goes wrong', () => {
        expect(optionalStage('ok', () => 42, null)).toBe(42);
        expect(error).not.toHaveBeenCalled();
    });

    it('returns the fallback instead of throwing', () => {
        expect(optionalStage('boom', () => { throw new Error('nope'); }, null)).toBeNull();
    });

    it('logs at error level, naming the stage', () => {
        optionalStage('take-home calculator', () => { throw new Error('nope'); }, null);

        expect(error).toHaveBeenCalledOnce();
        expect(String(error.mock.calls[0][0])).toContain('take-home calculator');
    });

    it('says in the log that this is a bug, not an expected condition', () => {
        // Guards against the failure mode of this whole pattern: a swallowed exception that
        // reads like normal operation and so never gets fixed.
        optionalStage('x', () => { throw new Error('nope'); }, null);
        expect(String(error.mock.calls[0][0]).toLowerCase()).toContain('bug');
    });

    it('passes the thrown error through to the log for diagnosis', () => {
        const thrown = new Error('the actual cause');
        optionalStage('x', () => { throw thrown; }, null);
        expect(error.mock.calls[0]).toContain(thrown);
    });

    it('supports a non-null fallback, for shapes the UI requires', () => {
        // Per-field confidence must always be an object: the contract test asserts it is never
        // null, so its fallback is an empty assessment rather than nothing.
        const empty = { fields: {}, overall: 'medium' as const, caveat: null };
        expect(optionalStage('confidence', () => { throw new Error('nope'); }, empty)).toBe(empty);
    });

    it('does not catch anything the compute function did not throw', () => {
        // Sanity: it is a try/catch, not a retry or a timeout. A returned rejected promise is
        // the caller's problem, which is why every current stage is synchronous.
        expect(optionalStage('x', () => 'value', 'fallback')).toBe('value');
    });
});
