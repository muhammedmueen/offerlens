import { describe, it, expect } from 'vitest';
import { submitSalarySchema } from './salary.schema.js';

const valid = { role: 'Backend Engineer', city: 'Pune', experienceYears: 3, ctc: 1_500_000, companyType: 'product' };
const parse = (extra: Record<string, unknown>) => submitSalarySchema.body.safeParse({ ...valid, ...extra });

describe('submitSalarySchema payBasis (5.7)', () => {
    it('accepts current, offered and absent', () => {
        expect(parse({ payBasis: 'current' }).success).toBe(true);
        expect(parse({ payBasis: 'offered' }).success).toBe(true);
        expect(parse({}).success).toBe(true);
        expect(submitSalarySchema.body.parse(valid)).not.toHaveProperty('payBasis');
    });

    it('rejects null, the empty string and any other value', () => {
        for (const payBasis of [null, '', 'both', 'Current', 'unsure']) {
            expect(parse({ payBasis }).success, String(payBasis)).toBe(false);
        }
    });
});