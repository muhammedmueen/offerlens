import { describe, it, expect } from 'vitest';
import {
    isUsableFactor, isCityAdjustedScope, isAllExperienceScope, cityLabel, adjustedLocationLabel,
    PLFS_CITATION_TEXT, PLFS_URL, type CityAdjustment,
} from './city-adjustment.js';
import { toSalaryComparison } from './benchmark-comparison.js';
import { progressionNotes } from './progression.js';
import type { Benchmark } from './salary.service.js';
import { scoreSalary } from '@/modules/analysis/score.rubric.js';
import { assessConfidence } from '@/modules/analysis/confidence.js';
import { describeMarketData } from '@/providers/ai/market-data.js';
import { salaryBasisKey } from '@/modules/comparison/comparison.matrix.js';

const ADJ: CityAdjustment = {
    source: 'plfs_2023_24', city: 'delhi ncr', cityLabel: 'Delhi NCR', factor: 1.25, plfsSampleSize: 86, period: '2023-24',
};
const survey = (over: Partial<Benchmark> = {}): Benchmark => ({
    source: 'public_survey', scope: 'role_city_adjusted',
    marketRange: { p25: 1, p50: 2, p75: 3, p90: 4 }, offerPercentile: 40,
    roleUsed: 'Backend Engineer', referenceFamilies: ['Backend Engineer'], roleMatchConfidence: 1,
    locationUsed: adjustedLocationLabel('delhi ncr'), sampleSize: 30,
    experienceBracket: null, experienceYearsRange: null, cityAdjustment: ADJ, ...over,
});

describe('city-adjustment helpers', () => {
    it('isUsableFactor enforces the floor and the bounds', () => {
        expect(isUsableFactor({ nRespondents: 30, factor: 0.5 })).toBe(true);
        expect(isUsableFactor({ nRespondents: 30, factor: 2 })).toBe(true);
        expect(isUsableFactor({ nRespondents: 29, factor: 1 })).toBe(false);
        expect(isUsableFactor({ nRespondents: 100, factor: 2.01 })).toBe(false);
        expect(isUsableFactor({ nRespondents: 100, factor: 0.49 })).toBe(false);
        expect(isUsableFactor({ nRespondents: 100, factor: Number.POSITIVE_INFINITY })).toBe(false);
        expect(isUsableFactor(undefined)).toBe(false);
    });

    it('scope helpers: the two new scopes are adjusted; role-wide scopes are all-experience', () => {
        expect(isCityAdjustedScope('role_city_adjusted')).toBe(true);
        expect(isCityAdjustedScope('role_experience_city_adjusted')).toBe(true);
        expect(isCityAdjustedScope('role_national')).toBe(false);
        expect(isCityAdjustedScope(undefined)).toBe(false);
        expect(isAllExperienceScope('role_national')).toBe(true);
        expect(isAllExperienceScope('role_city_adjusted')).toBe(true);
        expect(isAllExperienceScope('role_experience_city_adjusted')).toBe(false);
    });

    it('labels: display casing from the seed, and the adjusted location label', () => {
        expect(cityLabel('bangalore')).toBe('Bangalore');
        expect(cityLabel('delhi ncr')).toBe('Delhi NCR');
        expect(adjustedLocationLabel('pune')).toBe('India (national), adjusted for Pune');
    });

    it('the PLFS citation is the exact required sentence with a real link', () => {
        expect(PLFS_CITATION_TEXT).toBe('City adjustment derived from the Periodic Labour Force Survey 2023-24, National Statistics Office, MoSPI.');
        expect(PLFS_URL).toMatch(/^https:\/\/microdata\.gov\.in\//);
    });
});

describe('labels for the adjusted scope', () => {
    it('toSalaryComparison: PLFS wording, factor and n, estimate caveat; dataSource stays public_survey', () => {
        const c = toSalaryComparison(survey());
        expect(c).toMatchObject({ dataSource: 'public_survey', benchmarkScope: 'role_city_adjusted', cityAdjustment: ADJ, locationUsed: 'India (national), adjusted for Delhi NCR' });
        expect(c.disclaimer).toContain('adjusted for Delhi NCR by a city factor of 1.25');
        expect(c.disclaimer).toContain('Periodic Labour Force Survey 2023-24');
        expect(c.disclaimer).toContain('n = 86 sampled respondents');
        expect(c.disclaimer).toContain('not offers or pay data from Delhi NCR');
        expect(c.disclaimer).toContain('Survey figures describe current pay.');
        expect(c.disclaimer).not.toContain('India-wide benchmark');
    });

    it('toSalaryComparison: the national wording and shape are untouched (no cityAdjustment key)', () => {
        const c = toSalaryComparison(survey({ scope: 'role_national', cityAdjustment: undefined, locationUsed: 'India (national)' }));
        expect(c.disclaimer).toContain('India-wide benchmark from the Stack Overflow Developer Survey 2025');
        expect(c.disclaimer).toContain('all cities');
        expect(c).not.toHaveProperty('cityAdjustment');
    });

    it('toSalaryComparison: the Fresher sentence is appended unchanged under the adjusted scope', () => {
        const c = toSalaryComparison(survey({
            offerPercentile: null, percentileWithheld: { reason: 'no_experience_rows', yearsRange: { min: 0, max: 0 } },
        }));
        expect(c.disclaimer).toContain('Your offer is not ranked against it, and salary is left out of the score.');
        expect(c.percentileWithheld).toBe('no_experience_rows');
    });

    it('the rubric note says scaled-to-city and an estimate; national keeps its text; role-wide adjusted adds "all experience levels"', () => {
        const adjusted = scoreSalary(40, 'public_survey', 'role_experience_city_adjusted').note;
        expect(adjusted).toContain('scaled to your city by a PLFS-based factor');
        expect(adjusted).not.toContain('national, not specific');
        expect(scoreSalary(40, 'public_survey', 'role_city_adjusted').note).toContain('across all experience levels');
        expect(scoreSalary(40, 'public_survey', 'role_national').note)
            .toBe('Offer sits at roughly the 40th percentile of Stack Overflow Developer Survey 2025 respondents in India (national, not specific to your city) across all experience levels');
        expect(scoreSalary(40, 'public_survey', 'role_experience_city_adjusted').basis).toEqual({ source: 'public_survey', scope: 'role_experience_city_adjusted' });
    });

    it('confidence stays medium for the adjusted benchmark (never high), with the two-survey reason', () => {
        const sc = toSalaryComparison(survey());
        const c = assessConfidence({ salaryComparison: sc } as never).fields.salaryComparison;
        expect(c.level).toBe('medium');
        expect(c.reason).toContain('scaled to your city');
        const nat = assessConfidence({ salaryComparison: toSalaryComparison(survey({ scope: 'role_national', cityAdjustment: undefined })) } as never).fields.salaryComparison;
        expect(nat.level).toBe('medium');
        expect(nat.reason).toContain('not specific to your city');
    });

    it('the negotiation prompt says scaled/estimate for the adjusted scope and never calls it offers or city data', () => {
        const text = describeMarketData(toSalaryComparison(survey()));
        expect(text).toContain('scaled to the city by a PLFS 2023-24 factor');
        expect(text).toContain('scaled to the city using PLFS 2023-24');
        expect(text).toContain('Do NOT describe them as offers, submissions or data for this city.');
        expect(text).not.toContain('VERIFIED');
        const nat = describeMarketData(toSalaryComparison(survey({ scope: 'role_national', cityAdjustment: undefined })));
        expect(nat).toContain('India-wide, not specific to this city');
        expect(nat).not.toContain('PLFS');
    });

    it('comparison: adjusted and national survey offers get different basis keys', () => {
        const entry = (scope: string) => ({ components: [{ key: 'salary', value: 40, basis: { source: 'public_survey', scope } }] }) as never;
        expect(salaryBasisKey(entry('role_city_adjusted'))).toBe('public_survey:role_city_adjusted');
        expect(salaryBasisKey(entry('role_city_adjusted'))).not.toBe(salaryBasisKey(entry('role_national')));
    });

    it('career notes: adjusted text names the city, factor and n; the national text is unchanged', () => {
        const [adjusted] = progressionNotes([], ['Backend Engineer'], ADJ);
        expect(adjusted.disclaimer).toContain('adjusted for Delhi NCR by a factor of 1.25');
        expect(adjusted.disclaimer).toContain('(n = 86)');
        expect(adjusted.disclaimer).not.toContain('all cities');
        const [national] = progressionNotes([], ['Backend Engineer']);
        expect(national.disclaimer).toContain('India-wide figures from the Stack Overflow Developer Survey 2025 (Backend Engineer respondents, all cities). Each row');
    });
});
