import { describe, it, expect } from 'vitest';
import { percentileRank, MIN_SAMPLE_SIZE } from './salary.service.js';

describe('percentileRank', () => {
    const sorted = [1_000_000, 1_500_000, 2_000_000, 2_500_000, 3_000_000];

    it('places an offer above everything near the top', () => {
        expect(percentileRank(sorted, 4_000_000)).toBe(100);
    });

    it('places an offer below everything near the bottom', () => {
        expect(percentileRank(sorted, 500_000)).toBe(0);
    });

    it('places a mid offer in the middle', () => {
        // Two below, two above, one equal -> (2 + 0.5) / 5 = 50%
        expect(percentileRank(sorted, 2_000_000)).toBe(50);
    });

    it('does not report the 0th percentile for a match on the lowest submission', () => {
        // Midpoint convention. A strict "count below" would say 0, which reads as far
        // more damning than matching the cheapest data point actually warrants.
        expect(percentileRank(sorted, 1_000_000)).toBe(10);
    });

    it('handles ties without exceeding 100', () => {
        expect(percentileRank([2_000_000, 2_000_000, 2_000_000], 2_000_000)).toBe(50);
        expect(percentileRank([2_000_000, 2_000_000], 3_000_000)).toBe(100);
    });

    it('returns a neutral 50 for an empty set rather than dividing by zero', () => {
        expect(percentileRank([], 2_000_000)).toBe(50);
    });

    it('is monotonic — a better offer never ranks lower', () => {
        let previous = -1;
        for (const value of [0, 900_000, 1_000_000, 1_750_000, 2_000_000, 3_000_000, 9_000_000]) {
            const rank = percentileRank(sorted, value);
            expect(rank).toBeGreaterThanOrEqual(previous);
            previous = rank;
        }
    });

    it('keeps the sample floor at a documented single constant', () => {
        // Guards against the threshold drifting back into scattered literals. Raising it
        // to 10 (Phase 4) should be a one-line change.
        expect(MIN_SAMPLE_SIZE).toBe(5);
    });
});
