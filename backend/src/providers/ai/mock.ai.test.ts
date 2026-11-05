import { describe, expect, it } from 'vitest';
import { CORPUS } from '../../../eval/corpus.js';
import { MockAiProvider, readMockFields } from './mock.ai.js';

const letter = (id: string) => CORPUS.find((c) => c.id === id)!.text;

describe('readMockFields', () => {
    it('reads the company and CTC the E2E letters state, across line breaks', () => {
        expect(readMockFields(letter('01-indian-product-clean'))).toMatchObject({
            companyName: 'Zenthara Technologies Private Limited',
            totalCTC: 2400000,
        });
        expect(readMockFields(letter('05-red-flag-heavy'))).toMatchObject({
            companyName: 'Vireo Systems Pvt Ltd',
            totalCTC: 2800000,
        });
    });

    it('names only the benefits the letter mentions', () => {
        expect(readMockFields(letter('01-indian-product-clean')).benefits).toEqual([
            'Provident Fund',
            'Health Insurance',
            'Paid Leave',
        ]);
        expect(readMockFields(letter('05-red-flag-heavy')).benefits).toEqual(['Provident Fund']);
    });

    it('falls back to sample values when the text states nothing', () => {
        expect(readMockFields('x')).toEqual({ companyName: 'Mock Corp', totalCTC: 1200000, benefits: [] });
    });
});

describe('MockAiProvider.analyzeOffer', () => {
    it('carries the letter values into the analysis and always offers a tip', async () => {
        const result = await new MockAiProvider().analyzeOffer(letter('05-red-flag-heavy'));
        expect(result.extractedData.companyName).toBe('Vireo Systems Pvt Ltd');
        expect(result.extractedData.compensation.totalCTC).toBe(2800000);
        expect(result.negotiationSuggestions).toHaveLength(1);
        expect(result.benefits.map((b) => b.name)).toEqual(['Provident Fund']);
    });
});
