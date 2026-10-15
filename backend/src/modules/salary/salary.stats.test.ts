import { describe, it, expect } from 'vitest';
import {
    MIN_SAMPLE_SIZE, recencyWeight, rejectOutliers, summarise,
    weightedPercentile, weightedPercentileRank, type WeightedValue,
} from './salary.stats.js';

const w = (...values: number[]): WeightedValue[] => values.map((value) => ({ value, weight: 1 }));
const MONTH_MS = 30.4375 * 24 * 60 * 60 * 1000;

describe('MIN_SAMPLE_SIZE', () => {
    it('is 10', () => expect(MIN_SAMPLE_SIZE).toBe(10));
});

describe('recencyWeight (5.3)', () => {
    it('is 1 for a brand-new row and never above 1 for a future one', () => {
        expect(recencyWeight(1_000, 1_000)).toBe(1);
        expect(recencyWeight(2_000, 1_000)).toBe(1);
    });
    it('is 1 / (1 + 0.1 * months)', () => {
        expect(recencyWeight(0, 10 * MONTH_MS)).toBeCloseTo(0.5, 10);
        expect(recencyWeight(0, 5 * MONTH_MS)).toBeCloseTo(1 / 1.5, 10);
    });
});

describe('rejectOutliers (5.3, robust 3-sigma in log space)', () => {
    const realistic = w(1_200_000, 1_300_000, 1_450_000, 1_500_000, 1_600_000, 1_700_000,
        1_800_000, 1_900_000, 2_000_000, 2_200_000, 2_400_000, 2_600_000);

    it('drops a 1e9 poison value and keeps the realistic ones', () => {
        const out = rejectOutliers([...realistic, ...w(1e9)]);
        expect(out).toHaveLength(realistic.length);
        expect(out.some((i) => i.value === 1e9)).toBe(false);
    });

    it('is not inert at n = 10 (a literal mean/sigma test cannot reject anything here)', () => {
        const ten = w(1_500_000, 1_600_000, 1_700_000, 1_800_000, 1_900_000, 2_000_000,
            2_100_000, 2_200_000, 2_300_000, 1e9);
        expect(rejectOutliers(ten)).toHaveLength(9);
    });

    it('rejects nothing when MAD is 0 and the rest are within the floor', () => {
        expect(rejectOutliers(w(2e6, 2e6, 2e6, 2e6, 2e6, 2e6))).toHaveLength(6);
    });

    it('uses the sigma floor when half the values are identical (20% off out, 10% off kept)', () => {
        // Six identical, so MAD is tiny/zero; without the floor every other value would go.
        const out = rejectOutliers(w(2e6, 2e6, 2e6, 2e6, 2e6, 2e6, 2.2e6, 2.4e6, 2.0e6, 2e6, 2e6, 2e6));
        const values = out.map((i) => i.value);
        expect(values).toContain(2.2e6);      // 10% off: kept
        expect(values).not.toContain(2.4e6);  // 20% off: rejected
    });

    it('works in log space, so a genuine high earner is kept', () => {
        const out = rejectOutliers(w(1e6, 1.2e6, 1.4e6, 1.6e6, 1.8e6, 2e6, 2.4e6, 2.8e6, 3.4e6, 4.2e6, 5.2e6, 6.5e6));
        expect(out.map((i) => i.value)).toContain(6.5e6);
    });

    it('drops non-positive and non-finite values instead of producing NaN', () => {
        expect(rejectOutliers(w(0, -5, NaN, 1e6, 1e6))).toHaveLength(2);
        expect(rejectOutliers([])).toEqual([]);
    });
});

describe('weightedPercentile', () => {
    const oneToTen = w(1, 2, 3, 4, 5, 6, 7, 8, 9, 10);

    it('gives p25 3, p50 5.5, p75 8, p90 9.5 for 1..10 and clamps the ends', () => {
        expect(weightedPercentile(oneToTen, 25)).toBeCloseTo(3, 10);
        expect(weightedPercentile(oneToTen, 50)).toBeCloseTo(5.5, 10);
        expect(weightedPercentile(oneToTen, 75)).toBeCloseTo(8, 10);
        expect(weightedPercentile(oneToTen, 90)).toBeCloseTo(9.5, 10);
        expect(weightedPercentile(oneToTen, 0)).toBe(1);
        expect(weightedPercentile(oneToTen, 100)).toBe(10);
    });
    it('median of an odd set is the middle value', () => {
        expect(weightedPercentile(w(1, 5, 9), 50)).toBe(5);
    });
    it('returns a single item for every p', () => {
        for (const p of [0, 25, 50, 90, 100]) expect(weightedPercentile(w(7), p)).toBe(7);
    });
    it('a heavy weight moves the result toward its value', () => {
        const heavy: WeightedValue[] = [{ value: 1, weight: 1 }, { value: 2, weight: 1 }, { value: 10, weight: 20 }];
        expect(weightedPercentile(heavy, 50)).toBeGreaterThan(weightedPercentile(w(1, 2, 10), 50));
    });
});

describe('weightedPercentileRank', () => {
    it('is 50 for an empty list', () => expect(weightedPercentileRank([], 5)).toBe(50));
    it('uses the midpoint convention', () => {
        expect(weightedPercentileRank(w(1, 2, 3, 4, 5), 3)).toBe(50);
        expect(weightedPercentileRank(w(1, 2, 3, 4, 5), 1)).toBe(10);
    });
});

describe('summarise', () => {
    const nine = w(1, 2, 3, 4, 5, 6, 7, 8, 9).map((i) => ({ ...i, value: i.value * 1e6 }));
    const ten = [...nine, { value: 10e6, weight: 1 }];

    it('returns null at 9 and a result at 10', () => {
        expect(summarise(nine, null, { rejectOutliers: false })).toBeNull();
        expect(summarise(ten, null, { rejectOutliers: false })?.sampleSize).toBe(10);
    });

    it('applies the threshold AFTER rejection: 10 raw with 2 outliers gives null', () => {
        const raw = [...w(1.5e6, 1.6e6, 1.7e6, 1.8e6, 1.9e6, 2e6, 2.1e6, 2.2e6), ...w(1e9, 5)];
        expect(raw).toHaveLength(10);
        expect(summarise(raw, null, { rejectOutliers: true })).toBeNull();
        expect(summarise(raw, null, { rejectOutliers: false })).not.toBeNull();
    });

    it('returns rounded percentiles and the offer percentile only for a positive offer', () => {
        const s = summarise(ten, 5.5e6, { rejectOutliers: false })!;
        expect(s.marketRange).toEqual({ p25: 3e6, p50: 5.5e6, p75: 8e6, p90: 9.5e6 });
        expect(s.offerPercentile).toBe(50);
        expect(summarise(ten, null, { rejectOutliers: false })!.offerPercentile).toBeNull();
        expect(summarise(ten, 0, { rejectOutliers: false })!.offerPercentile).toBeNull();
    });

    it('does not mutate its input order', () => {
        const shuffled = [...ten].reverse();
        summarise(shuffled, null, { rejectOutliers: false });
        expect(shuffled[0].value).toBe(10e6);
    });
});

describe('rejectOutliers keeps extra properties (5.7: the pay-basis tag survives)', () => {
    it('returns the same tagged objects it keeps', () => {
        const items = Array.from({ length: 12 }, (_, i) => ({ value: 2_000_000 + i * 10_000, weight: 1, basis: i % 2 ? 'offered' : null }));
        const poison = { value: 1_000_000_000, weight: 1, basis: 'current' as const };
        const kept = rejectOutliers([...items, poison]);
        expect(kept).toHaveLength(12);
        expect(kept.every((k) => 'basis' in k)).toBe(true);
        expect(kept).not.toContain(poison);
    });
});