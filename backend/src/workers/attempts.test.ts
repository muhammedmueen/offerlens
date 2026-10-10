import { describe, it, expect } from 'vitest';
import { isFinalAttempt } from './attempts.js';

describe('isFinalAttempt', () => {
    it.each([
        [0, false],
        [1, false],
        [2, true],
    ])('attemptsMade %i of 3 → %s', (attemptsMade, expected) => {
        expect(isFinalAttempt({ attemptsMade, opts: { attempts: 3 } })).toBe(expected);
    });

    it('no attempts option means a single, final attempt', () => {
        expect(isFinalAttempt({ attemptsMade: 0, opts: {} })).toBe(true);
    });
});
