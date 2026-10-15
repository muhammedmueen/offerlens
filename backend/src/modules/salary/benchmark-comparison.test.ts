import { describe, it, expect } from 'vitest';
import { toSalaryComparison, pickBenchmarkCity, AI_ESTIMATE_DISCLAIMER } from './benchmark-comparison.js';
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

    it('labels crowd rows unverified, says some may be offered pay, and passes confidence 1 through', () => {
        const c = toSalaryComparison(crowd);
        expect(c.dataSource).toBe('crowdsourced');
        expect(c.disclaimer).toBe('Based on 12 crowdsourced, unverified submissions for this role and city. Some may be offered, not current, pay.');
        expect(c.roleMatchConfidence).toBe(1);
        expect(toSalaryComparison({ ...crowd, sampleSize: 1 }).disclaimer).toContain('1 crowdsourced, unverified submission for');
    });
});

describe('AI_ESTIMATE_DISCLAIMER', () => {
    it('does not claim verification', () => {
        expect(AI_ESTIMATE_DISCLAIMER).toContain('crowdsourced');
        expect(AI_ESTIMATE_DISCLAIMER).not.toMatch(/verified/i);
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

describe('5.6: toSalaryComparison, percentile withheld', () => {
    const withheld = survey({
        scope: 'role_national', experienceBracket: null, experienceYearsRange: null, offerPercentile: null,
        percentileWithheld: { reason: 'no_experience_rows', yearsRange: { min: 0, max: 0 } },
    });

    it('says why in plain words: no respondents at 0 years, shown for information, not ranked, left out of the score', () => {
        const c = toSalaryComparison(withheld);
        expect(c.disclaimer).toContain('The survey has no respondents for this role with 0 years of experience');
        expect(c.disclaimer).toContain('shown for information only');
        expect(c.disclaimer).toContain('not ranked against it');
        expect(c.disclaimer).toContain('salary is left out of the score');
        expect(c.disclaimer).not.toMatch(/verified|submission/i);
        expect(c.percentileWithheld).toBe('no_experience_rows');
        expect(c.offerPercentile).toBeNull();
    });

    it('states an open-ended or multi-year empty range as queried', () => {
        const d = (yearsRange: { min: number; max: number | null }) =>
            toSalaryComparison({ ...withheld, percentileWithheld: { reason: 'no_experience_rows', yearsRange } }).disclaimer;
        expect(d({ min: 1, max: 2 })).toContain('with 1-2 years of experience');
    });

    it('a normal survey disclaimer ends with the current-pay sentence and has no withheld text or flag', () => {
        const c = toSalaryComparison(survey());
        expect(c.disclaimer).toMatch(/Survey figures describe current pay\.$/);
        expect(c.disclaimer).not.toContain('not ranked');
        expect(c).not.toHaveProperty('percentileWithheld');
    });
});

describe('5.7: toSalaryComparison, crowd pay basis wording', () => {
    const crowd = (over: Partial<Benchmark> = {}): Benchmark => survey({
        source: 'crowdsourced', scope: 'role_city', referenceFamilies: [], experienceBracket: null,
        experienceYearsRange: null, roleMatchConfidence: 1, sampleSize: 12, ...over,
    });
    const text = (over: Partial<Benchmark>) => toSalaryComparison(crowd(over)).disclaimer;

    it('offered and current tiers say all of the data points are that kind of pay', () => {
        expect(text({ payBasis: 'offered', payMix: null })).toBe(
            'Based on 12 crowdsourced, unverified submissions for this role and city. '
            + 'All 12 are offered pay: what employers offered, not necessarily what people are paid now.');
        expect(text({ payBasis: 'current', payMix: null })).toBe(
            'Based on 12 crowdsourced, unverified submissions for this role and city. All 12 are current pay.');
    });

    it('mixed names the pooling and the mix, omitting zero parts', () => {
        const head = 'Based on 15 crowdsourced, unverified data points for this role and city, pooled because no single kind of pay had 10 yet. ';
        expect(text({ sampleSize: 15, payBasis: 'mixed', payMix: { offered: 12, current: 0, unlabelled: 3 } }))
            .toBe(`${head}12 of 15 data points are offered pay, 3 are not labelled.`);
        expect(text({ sampleSize: 12, payBasis: 'mixed', payMix: { offered: 0, current: 4, unlabelled: 8 } }))
            .toContain('4 of 12 data points are current pay, 8 are not labelled.');
        expect(text({ sampleSize: 12, payBasis: 'mixed', payMix: { offered: 5, current: 7, unlabelled: 0 } }))
            .toContain('5 of 12 data points are offered pay, 7 are current pay.');
        expect(text({ sampleSize: 12, payBasis: 'mixed', payMix: { offered: 0, current: 12, unlabelled: 0 } }))
            .toContain('12 of 12 data points are current pay.');
    });

    it('singular agreement: 1 of 1 data point is offered pay', () => {
        expect(text({ sampleSize: 1, payBasis: 'mixed', payMix: { offered: 1, current: 0, unlabelled: 0 } }))
            .toContain('1 of 1 data point is offered pay.');
        expect(text({ sampleSize: 12, payBasis: 'mixed', payMix: { offered: 1, current: 1, unlabelled: 10 } }))
            .toContain('1 of 12 data points is offered pay, 1 is current pay, 10 are not labelled.');
    });

    it('all unlabelled rows: says none say whether it is current or offered pay', () => {
        expect(text({ payBasis: 'mixed', payMix: { offered: 0, current: 0, unlabelled: 12 } }))
            .toContain('None of the 12 data points say whether it is current or offered pay.');
    });

    it('copies payBasis and payMix; a benchmark with no payBasis keeps the old sentence and omits both', () => {
        const mixed = toSalaryComparison(crowd({ payBasis: 'mixed', payMix: { offered: 9, current: 1, unlabelled: 2 } }));
        expect(mixed).toMatchObject({ payBasis: 'mixed', payMix: { offered: 9, current: 1, unlabelled: 2 } });
        const old = toSalaryComparison(crowd());
        expect(old.disclaimer).toContain('Some may be offered, not current, pay.');
        expect(old).not.toHaveProperty('payBasis');
        expect(old).not.toHaveProperty('payMix');
    });
});