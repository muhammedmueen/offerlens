import type { SalaryComparison } from '@/modules/analysis/analysis.types.js';
import type { Benchmark } from './salary.service.js';
import { isIndianMetro } from './role-matching.js';
import { MIN_SAMPLE_SIZE } from './salary.stats.js';

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

/**
 * The mix sentence for a pooled crowd benchmark (5.7). Only non-zero parts, in the order offered,
 * current, not labelled. "12 of 15 data points are offered pay, 3 are not labelled."
 */
function mixSentence(n: number, mix: NonNullable<Benchmark['payMix']>): string {
    const points = n === 1 ? 'data point' : 'data points';
    if (mix.offered + mix.current === 0) {
        return `None of the ${n} ${points} say${n === 1 ? 's' : ''} whether it is current or offered pay.`;
    }
    const parts = ([[mix.offered, 'offered pay'], [mix.current, 'current pay'], [mix.unlabelled, 'not labelled']] as const)
        .filter(([count]) => count > 0)
        .map(([count, label], i) => `${i === 0 ? `${count} of ${n} ${points}` : count} ${count === 1 ? 'is' : 'are'} ${label}`);
    return `${parts.join(', ')}.`;
}

function crowdDisclaimer(b: Benchmark): string {
    const n = b.sampleSize;
    const one = n === 1;
    if (b.payBasis === 'offered' || b.payBasis === 'current') {
        const what = b.payBasis === 'offered'
            ? 'offered pay: what employers offered, not necessarily what people are paid now'
            : 'current pay';
        return `Based on ${n} crowdsourced, unverified submission${one ? '' : 's'} for this role and city. `
            + `All ${n} ${one ? 'is' : 'are'} ${what}.`;
    }
    if (b.payBasis === 'mixed') {
        return `Based on ${n} crowdsourced, unverified data point${one ? '' : 's'} for this role and city, `
            + `pooled because no single kind of pay had ${MIN_SAMPLE_SIZE} yet.${b.payMix ? ` ${mixSentence(n, b.payMix)}` : ''}`;
    }
    // No payBasis: a benchmark built before 5.7. Nothing verifies a submission.
    return `Based on ${n} crowdsourced, unverified submission${one ? '' : 's'} for this role and city. Some may be offered, not current, pay.`;
}

type RangeLike = { p25?: number | null; p50?: number | null; p75?: number | null; p90?: number | null };

/**
 * True only when all four quartiles are finite and > 0 (MONEY-2). An AI estimate with no range
 * is all-null; rows stored before MONEY-2 have it baked in as all-zero. Neither is a range.
 */
export function hasUsableRange(r: RangeLike | null | undefined): r is { p25: number; p50: number; p75: number; p90: number } {
    if (!r || typeof r !== 'object') return false;
    return [r.p25, r.p50, r.p75, r.p90].every((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
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
            disclaimer: crowdDisclaimer(b),
            ...(b.payBasis && { payBasis: b.payBasis }),
            ...(b.payMix && { payMix: b.payMix }),
        };
    }

    const adj = b.cityAdjustment;
    return {
        ...common,
        dataSource: 'public_survey',
        disclaimer: `${SURVEY_DISCLAIMER_PREFIX} `
            + (adj
                ? `National benchmark from the Stack Overflow Developer Survey 2025 (n = ${b.sampleSize}, `
                    + `${roleScope(b.referenceFamilies)}, ${experienceScope(b.experienceYearsRange)}), `
                    + `adjusted for ${adj.cityLabel} by a city factor of ${adj.factor.toFixed(2)} derived from monthly cash earnings `
                    + 'of urban salaried software professionals in the Periodic Labour Force Survey 2023-24 '
                    + `(PLFS, n = ${adj.plfsSampleSize} sampled respondents in the ${adj.cityLabel} area). `
                    + `This is an estimate: national survey figures scaled by one city factor, not offers or pay data from ${adj.cityLabel}. `
                : `India-wide benchmark from the Stack Overflow Developer Survey 2025 (n = ${b.sampleSize}, `
                    + `${roleScope(b.referenceFamilies)}, all cities, ${experienceScope(b.experienceYearsRange)}). `)
            // The survey measures current pay, so an offer ranked against it is offer versus current pay (5.7).
            + 'Survey figures describe current pay.'
            + (b.percentileWithheld
                ? ` The survey has no respondents for this role with ${experienceScope(b.percentileWithheld.yearsRange)}, `
                    + 'so this range covers all experience levels and is shown for information only. '
                    + 'Your offer is not ranked against it, and salary is left out of the score.'
                : ''),
        ...(b.percentileWithheld && { percentileWithheld: b.percentileWithheld.reason }),
        ...(adj && { cityAdjustment: adj }),
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
