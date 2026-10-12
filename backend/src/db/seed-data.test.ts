import { describe, it, expect } from 'vitest';
import { ROLES, EXPERIENCE, REFERENCE_FAMILIES } from './seed-data.js';

describe('seed-data', () => {
    it('every reference family is a seeded role', () => {
        const names = ROLES.map((r) => r.name);
        for (const f of REFERENCE_FAMILIES) expect(names).toContain(f);
    });

    it('has the six experience brackets', () => {
        expect(EXPERIENCE.map((e) => e.label)).toEqual([
            'Fresher (0-1 yrs)',
            'Junior (1-3 yrs)',
            'Mid-Level (3-5 yrs)',
            'Senior (5-8 yrs)',
            'Staff/Lead (8-12 yrs)',
            'Principal/Director (12+ yrs)',
        ]);
    });
});
