import { describe, it, expect } from 'vitest';
import { toSalaryComparison, pickBenchmarkCity } from './benchmark-comparison.js';
import type { Benchmark } from './salary.service.js';

const FOUR = ['Full Stack Engineer', 'Backend Engineer', 'Frontend Engineer', 'Mobile Engineer'];

const survey = (over: Partial<Benchmark> = {}): Benchmark => ({
    source: 'public_survey',
    scope: 'role_experience_national',
    marketRange: { p25: 1, p50: 2, p75: 3, p90: 4 },
    offerPercentile: 55,
    roleUsed: 'Backend Engineer',
    referenceFamilies: ['Backend Engineer'],
    roleMatchConfidence: 0.75,
    locationUsed: 'India (national)',
    sampleSize: 42,
    experienceBracket: 'Junior (1-3 yrs)',
    experienceYearsRange: { min: 1, max: 2 },
    ...over,
});

describe('toSalaryComparison: public_survey', () => {
    it('tags the source, uses the mandated disclaimer and never says verified or submission', () => {
        const c = toSalaryComparison(survey());
        expect(c.dataSource).toBe('public_survey');
        expect(c.disclaimer).toContain('Modelled from public surveys, not offers in your city');
        expect(c.disclaimer).not.toMatch(/verified|submission/i);
        expect(c).toMatchObject({ sampleSize: 42, benchmarkScope: 'role_experience_national', experienceBracket: 'Junior (1-3 yrs)', locationUsed: 'India (national)' });
        expect(c.disclaimer).toContain('n = 42');
    });

    it('does not store the ODbL attribution (the UI and PDF render it)', () => {
        expect(toSalaryComparison(survey()).disclaimer).not.toContain('Open Database License');
    });

    it('keeps a null percentile null', () => {
        expect(toSalaryComparison(survey({ offerPercentile: null })).offerPercentile).toBeNull();
    });

    it('names one family, or the four developer families', () => {
        expect(toSalaryComparison(survey()).disclaimer).toContain('Backend Engineer respondents');
        expect(toSalaryComparison(survey({ referenceFamilies: FOUR })).disclaimer)
            .toContain('developer respondents (full-stack, back-end, front-end and mobile)');
    });

    it('states the years actually queried, never the seed label', () => {
        const d = (b: Partial<Benchmark>) => toSalaryComparison(survey(b)).disclaimer;
        expect(d({})).toContain('1-2 years of experience');
        expect(d({})).not.toContain('Junior (1-3 yrs)');
        expect(d({ experienceYearsRange: { min: 0, max: 0 } })).toContain('0 years of experience');
        expect(d({ experienceYearsRange: { min: 12, max: null } })).toContain('12+ years of experience');
        expect(d({ scope: 'role_national', experienceBracket: null, experienceYearsRange: null })).toContain('all experience levels');
    });
});

describe('toSalaryComparison: crowdsourced', () => {
    const crowd: Benchmark = survey({
        source: 'crowdsourced', scope: 'role_city', roleUsed: 'wizard', referenceFamilies: [],
        roleMatchConfidence: 1, locationUsed: 'pune', sampleSize: 12, experienceBracket: null, experienceYearsRange: null,
    });

    it('keeps the verified-submissions wording and passes confidence 1 through', () => {
        const c = toSalaryComparison(crowd);
        expect(c.dataSource).toBe('crowdsourced');
        expect(c.disclaimer).toBe('Based on 12 verified submissions for this role and city.');
        expect(c.roleMatchConfidence).toBe(1);
        expect(toSalaryComparison({ ...crowd, sampleSize: 1 }).disclaimer).toContain('1 verified submission for');
    });
});

describe('pickBenchmarkCity', () => {
    it.each([
        ['Jaipur', 'Bangalore', 'Jaipur'],
        ['Remote', 'Pune', 'Pune'],
        ['India', 'Chennai', 'Chennai'],
        ['Bengaluru, Karnataka, India', 'Pune', 'Bengaluru, Karnataka, India'],
        ['', 'Pune', 'Pune'],
        [null, 'Pune', 'Pune'],
        [null, null, null],
        ['', undefined, null],
    ])('letter %j + form %j -> %j', (letter, form, expected) => {
        expect(pickBenchmarkCity(letter as string | null, form as string | null | undefined)).toBe(expected);
    });
});
