import type { SalaryComparison } from '@/modules/analysis/analysis.types.js';
import type { Benchmark } from './salary.service.js';
import { isIndianMetro } from './role-matching.js';

/**
 * Pure mapping from a `Benchmark` to the stored `SalaryComparison`, so the worker stays thin and the
 * wording is unit-tested. The ODbL attribution is NOT stored here: it is a constant rendered by the
 * UI and the PDF, so the wording can be corrected without migrating stored analyses.
 */

/** Fallback disclaimer when the model's own estimate carries none (used by the analysis worker). */
export const AI_ESTIMATE_DISCLAIMER =
    'Estimated from general market knowledge — not benchmarked against crowdsourced submissions.';

/** The fixed lead sentence of every survey disclaimer (benchmark and career progression). */
export const SURVEY_DISCLAIMER_PREFIX = 'Modelled from public surveys, not offers in your city.';

export function roleScope(families: readonly string[]): string {
    if (families.length === 1) return `${families[0]} respondents`;
    // A generic "Software Engineer" is never presented as if the survey had that exact title.
    return 'developer respondents (full-stack, back-end, front-end and mobile)';
}

/** States the range that was actually queried, never the seed label ("Junior (1-3 yrs)" is 1-2). */
function experienceScope(range: Benchmark['experienceYearsRange']): string {
    if (!range) return 'all experience levels';
    if (range.max === null) return `${range.min}+ years of experience`;
    if (range.min === range.max) return `${range.min} years of experience`;
    return `${range.min}-${range.max} years of experience`;
}

export function toSalaryComparison(b: Benchmark): SalaryComparison {
    const common = {
        marketRange: b.marketRange,
        offerPercentile: b.offerPercentile,
        roleUsed: b.roleUsed,
        roleMatchConfidence: b.roleMatchConfidence,
        locationUsed: b.locationUsed,
        sampleSize: b.sampleSize,
        benchmarkScope: b.scope,
        experienceBracket: b.experienceBracket,
    };

    if (b.source === 'crowdsourced') {
        return {
            ...common,
            dataSource: 'crowdsourced',
            // Nothing verifies a submission, and 5.4 adds offered figures to the pool (see the plan, 5.4 outcome).
            disclaimer: `Based on ${b.sampleSize} crowdsourced, unverified submission${b.sampleSize === 1 ? '' : 's'} for this role and city. Some may be offered, not current, pay.`,
        };
    }

    return {
        ...common,
        dataSource: 'public_survey',
        disclaimer: `${SURVEY_DISCLAIMER_PREFIX} `
            + `India-wide benchmark from the Stack Overflow Developer Survey 2025 (n = ${b.sampleSize}, `
            + `${roleScope(b.referenceFamilies)}, all cities, ${experienceScope(b.experienceYearsRange)}).`,
    };
}

const GENERIC_LOCATION = /^(remote|hybrid|wfh|work from home|pan[- ]?india|india|anywhere)\b/i;

/**
 * The city to benchmark against. The letter is evidence and the form is a claim, so a real city named
 * in the letter always wins, even a non-metro one (the survey tiers are then skipped, and the stored
 * "for this role and city" wording stays true). The form city is used only when the letter gives no
 * usable place: empty, or a generic token such as "Remote" or "India".
 */
export function pickBenchmarkCity(letterLocation: string | null | undefined, formCity: string | null | undefined): string | null {
    const letter = letterLocation?.trim() || null;
    const letterIsUnusable = !letter || (!isIndianMetro(letter) && GENERIC_LOCATION.test(letter));
    return letterIsUnusable ? (formCity || letter || null) : letter;
}
