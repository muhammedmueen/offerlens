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
