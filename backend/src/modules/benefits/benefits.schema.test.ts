import { describe, it, expect } from 'vitest';
import { calculateBenefitsSchema } from './benefits.schema.js';

describe('calculateBenefitsSchema overrides (BEN-5)', () => {
    const body = calculateBenefitsSchema.body!;

    it('rejects a negative override', () => {
        expect(body.safeParse({ overrides: { '#0': -1 } }).success).toBe(false);
    });

    it('accepts zero and positive overrides, or none', () => {
        expect(body.safeParse({ overrides: { '#0': 0, '#1': 5000 } }).success).toBe(true);
        expect(body.safeParse({}).success).toBe(true);
    });
});
