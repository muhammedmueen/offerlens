import { describe, it, expect } from 'vitest';
import { negotiateSchema } from './negotiation.schema.js';

// NEG-8 at the HTTP trust boundary: the focusAreas enum rejects non-enum strings (including
// prototype keys), dedupes valid values, and caps raw length at 5 before the dedupe.

describe('negotiateSchema.body focusAreas', () => {
    it('dedupes repeated valid values, preserving first-seen order', () => {
        const r = negotiateSchema.body.safeParse({ focusAreas: ['salary', 'salary'] });
        expect(r.success).toBe(true);
        expect(r.success && r.data?.focusAreas).toEqual(['salary']);
    });

    it('rejects a prototype key like constructor (enum)', () => {
        expect(negotiateSchema.body.safeParse({ focusAreas: ['constructor'] }).success).toBe(false);
    });

    it('rejects a 6-item body before dedupe (.max(5) runs first)', () => {
        const r = negotiateSchema.body.safeParse({
            focusAreas: ['salary', 'joining_bonus', 'benefits', 'equity', 'pto', 'salary'],
        });
        expect(r.success).toBe(false);
    });

    it('defaults tone and allows omitted focusAreas', () => {
        const r = negotiateSchema.body.safeParse({});
        expect(r.success).toBe(true);
        expect(r.success && r.data?.tone).toBe('professional');
    });
});
