import { describe, it, expect } from 'vitest';
import { ROLES, EXPERIENCE } from '@/db/seed-data.js';
import { matchRole, canonicalCity, isIndianMetro, bracketFromLabel, normaliseRole, REFERENCE_FAMILIES } from './role-matching.js';

const canon = (s: string) => matchRole(s).canonical;
const GENERIC = ['Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Mobile Engineer'];

describe('matchRole: synonyms and exact labels', () => {
    it('every canonical label the matcher can return is a seed role', () => {
        const names = new Set(ROLES.map((r) => r.name));
        const samples = ['SDE', 'sr sde', 'tech lead', 'principal engineer', 'Backend Dev Lead', 'QA tester',
            'ML engineer', 'devops', 'ios developer', 'mern', 'etl developer', 'engineering manager'];
        for (const s of samples) {
            const c = canon(s);
            if (c) expect(names.has(c)).toBe(true);
        }
    });

    it.each([
        ['SDE-2', 'Software Engineer', 0.9],
        ['Software Engineer II', 'Software Engineer', 0.9],
        ['Associate Software Engineer', 'Software Engineer', 0.9],
        ['Software Developer', 'Software Engineer', 0.9],
        ['SDE 3', 'Senior Software Engineer', 0.9],
        ['Tech Lead', 'Staff Software Engineer', 0.9],
        ['Principal Engineer', 'Principal Software Engineer', 0.9],
    ])('%s -> %s', (raw, canonical, confidence) => {
        expect(matchRole(raw)).toMatchObject({ canonical, confidence });
    });

    it('resolves keyword and generic-ladder titles', () => {
        expect(matchRole('Sr. SDE')).toMatchObject({ canonical: 'Senior Software Engineer' });
        expect(matchRole('Senior Backend Engineer (Payments)')).toMatchObject({ canonical: 'Backend Engineer', confidence: 0.75 });
        expect(canon('Front-end / Back-end Developer')).toBe('Full Stack Engineer');
        expect(canon('Staff Software Engineer, Search')).toBe('Staff Software Engineer');
    });

    it('seed labels map to themselves at confidence 1', () => {
        for (const r of ROLES) expect(matchRole(r.name)).toMatchObject({ canonical: r.name, confidence: 1 });
    });
});

describe('matchRole: guards and whole-word matching', () => {
    it.each(['Mechanical Engineer', 'Product Manager Intern', 'Mobile Sales Executive', 'Product Manager, Mobile', 'Throughput Engineer'])(
        '%s is not a developer', (raw) => {
            const m = matchRole(raw);
            expect(m.canonical).toBeNull();
            expect(m.confidence).toBe(0);
            expect(m.referenceFamilies).toEqual([]);
        });

    it('the hr guard is whole-word: Hrishikesh/Chromium/Three.js are not blocked', () => {
        expect(canon('Hrishikesh Software Engineer')).toBe('Software Engineer');
        expect(canon('Chromium Developer')).toBe('Software Engineer');
        expect(canon('Three.js Developer')).toBe('Software Engineer');
    });

    it('the guard still blocks a real HR title from the keyword rules', () => {
        expect(canon('HR Mobile Analyst')).toBeNull();
        expect(matchRole('HR Manager')).toMatchObject({ canonical: 'HR Manager', referenceFamilies: [] });
    });

    it('sde/swe/qa do not match inside longer words', () => {
        expect(canon('Wisdemo Specialist')).toBeNull();
        expect(canon('Aqaba Coordinator')).toBeNull();
        expect(canon('Swept Analyst')).toBeNull();
    });

    it('stays fast on an adversarial 120-char string', () => {
        const t = Date.now();
        matchRole(('a '.repeat(60)).trim());
        matchRole('sde'.repeat(40));
        expect(Date.now() - t).toBeLessThan(50);
    });

    it('caps the input at 120 characters', () => {
        expect(normaliseRole('x'.repeat(500))).toHaveLength(120);
    });
});

describe('matchRole: reference families and crowd key', () => {
    it('a domain label maps to itself; generic titles map to the four developer families', () => {
        expect(matchRole('Data Engineer').referenceFamilies).toEqual(['Data Engineer']);
        expect(matchRole('SDE-2').referenceFamilies).toEqual(GENERIC);
        expect(matchRole('Principal Engineer').referenceFamilies).toEqual(GENERIC);
    });
    it('QA, PM and unmatched roles have no reference families', () => {
        expect(matchRole('QA Engineer').referenceFamilies).toEqual([]);
        expect(matchRole('Product Manager').referenceFamilies).toEqual([]);
        expect(matchRole('Wizard').referenceFamilies).toEqual([]);
    });
    it('software testers resolve to QA, not the developer survey pool', () => {
        for (const t of ['Software Tester', 'Senior Software Testing Engineer', 'Manual Tester']) {
            const m = matchRole(t);
            expect(m.canonical).toBe('QA Engineer');
            expect(m.referenceFamilies).toEqual([]);
        }
        expect(matchRole('Software Engineer').canonical).toBe('Software Engineer');
    });
    it('every reference family is a seed role', () => {
        const names = new Set(ROLES.map((r) => r.name));
        for (const f of REFERENCE_FAMILIES) expect(names.has(f)).toBe(true);
    });
    it('crowdKey is the lowercase canonical label, or the raw lowercase trimmed string when unmatched', () => {
        expect(matchRole('SDE-2').crowdKey).toBe('software engineer');
        expect(matchRole('  Engineer ').crowdKey).toBe('engineer');
        expect(matchRole('Wizard').crowdKey).toBe('wizard');
    });
});

describe('canonicalCity / isIndianMetro', () => {
    it('finds a metro inside a longer location string', () => {
        expect(canonicalCity('Bengaluru, Karnataka, India')).toBe('bangalore');
        expect(canonicalCity('Gurugram')).toBe('delhi ncr');
        expect(canonicalCity('New Delhi')).toBe('delhi ncr');
    });
    it('returns null for non-metros and generic tokens', () => {
        for (const c of ['London', 'Remote', 'Jaipur']) {
            expect(canonicalCity(c)).toBeNull();
            expect(isIndianMetro(c)).toBe(false);
        }
        expect(isIndianMetro('Pune')).toBe(true);
    });
    it('the leftmost alias wins', () => {
        expect(canonicalCity('Mumbai / Pune')).toBe('mumbai');
        expect(canonicalCity('Pune, Mumbai')).toBe('pune');
    });
});

describe('bracketFromLabel', () => {
    it('maps every seed label to its own bracket', () => {
        for (const b of EXPERIENCE) expect(bracketFromLabel(b.label)).toEqual(b);
        expect(bracketFromLabel('mid-level (3-5 YRS)')?.label).toBe('Mid-Level (3-5 yrs)');
    });
    it('falls back to a regex on the first number, half-open', () => {
        expect(bracketFromLabel('3-4 years')?.label).toBe('Mid-Level (3-5 yrs)');
        expect(bracketFromLabel('5 - 7 years')?.label).toBe('Senior (5-8 yrs)');
        expect(bracketFromLabel('15+ years')?.label).toBe('Principal/Director (12+ yrs)');
        expect(bracketFromLabel('0-1 years')?.label).toBe('Fresher (0-1 yrs)');
    });
    it('is null for missing or unparseable labels', () => {
        expect(bracketFromLabel(null)).toBeNull();
        expect(bracketFromLabel(undefined)).toBeNull();
        expect(bracketFromLabel('')).toBeNull();
        expect(bracketFromLabel('experienced')).toBeNull();
    });
});
