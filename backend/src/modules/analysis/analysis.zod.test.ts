import { describe, it, expect } from 'vitest';
import { DATA_SOURCES, MODEL_DATA_SOURCES, salaryComparisonSchema } from './analysis.zod.js';

describe('public_survey is worker-only', () => {
    it('is a stored data source but not one the model may claim', () => {
        expect(DATA_SOURCES).toContain('public_survey');
        expect([...MODEL_DATA_SOURCES]).toEqual(['ai_estimated', 'crowdsourced']);
    });

    it('a model response claiming public_survey parses to ai_estimated', () => {
        const parsed = salaryComparisonSchema.parse({ dataSource: 'public_survey' });
        expect(parsed.dataSource).toBe('ai_estimated');
    });
});

describe('salaryComparisonSchema never invents figures (MONEY-2)', () => {
    const NULL_RANGE = { p25: null, p50: null, p75: null, p90: null };

    it('keeps an explicit null percentile and null range as null', () => {
        const parsed = salaryComparisonSchema.parse({ offerPercentile: null, marketRange: NULL_RANGE });
        expect(parsed.offerPercentile).toBeNull();
        expect(parsed.marketRange).toEqual(NULL_RANGE);
    });

    it('a missing percentile and range parse to null, never 50 or 0', () => {
        const parsed = salaryComparisonSchema.parse({});
        expect(parsed.offerPercentile).toBeNull();
        expect(parsed.marketRange).toEqual(NULL_RANGE);
    });

    it('passes a real range and percentile through (string figures coerce)', () => {
        const parsed = salaryComparisonSchema.parse({
            offerPercentile: 62,
            marketRange: { p25: '2400000', p50: 2_800_000, p75: 3_200_000, p90: 3_600_000 },
        });
        expect(parsed.offerPercentile).toBe(62);
        expect(parsed.marketRange).toEqual({ p25: 2_400_000, p50: 2_800_000, p75: 3_200_000, p90: 3_600_000 });
    });
});
