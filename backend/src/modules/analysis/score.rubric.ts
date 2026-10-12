import type { AnalysisResult, RedFlag } from './analysis.types.js';
import type { BenefitsChecklist } from '@/modules/benefits/benefits.checklist.js';
import type { BenchmarkScope, BenchmarkSource } from '@/modules/salary/salary.service.js';

/**
 * Weighted scoring rubric (Phase 2 task 10, decision 7).
 *
 * Replaces an interim formula that started at 70 and nudged: -15 per high-severity flag, +20 if
 * the offer sat above the 75th percentile, +5 for more than five benefits. Two problems with
 * it. The baseline of 70 meant a letter with nothing wrong and nothing good scored "good", and
 * the result was unexplainable — a score of 55 gave no way to say which part was weak.
 *
 * Five components, each scored 0-100 on its own terms and then weighted:
 *
 *   30  red flags      the most trustworthy signal now that clause detection is deterministic
 *   30  salary         only when benchmarked against crowdsourced submissions or the public survey
 *   20  benefits       from the standard-benefits checklist
 *   10  growth         learning budget and equity, the only growth signals a letter carries
 *   10  transparency   how much the employer committed to in writing
 *
 * Weights are decision 7, revised from 35/25/20/10/10 because the original put the largest
 * weight on salary — the least reliable input, since the crowdsourced table is mostly empty.
 *
 * ── REDISTRIBUTION ───────────────────────────────────────────────────────────
 * A component with no data contributes nothing and its weight is spread proportionally over
 * the components that do have data. Required by the roadmap for missing salary data, which is
 * currently the common case rather than the exception.
 *
 * The alternative — scoring an absent component as zero — would punish an offer for a gap in
 * OUR data, which is the mistake the previous formula made in reverse by moving the score up to
 * 20 points on a percentile the model had invented.
 */

export type ScoreComponentKey = 'redFlags' | 'salary' | 'benefits' | 'growth' | 'transparency';

export const COMPONENT_WEIGHTS: Record<ScoreComponentKey, number> = {
    redFlags: 30,
    salary: 30,
    benefits: 20,
    growth: 10,
    transparency: 10,
};

/**
 * Penalties against a starting 100 for the red-flag component.
 *
 * Calibrated so that TWO high-severity clauses leave almost nothing. A weighted average is
 * inherently forgiving — at 30% weight, even a zero here only costs 30 points — so a gentler
 * curve let a letter with a 12-month non-compete and no-notice probation still land in "fair".
 * Two high-severity restrictions is a seriously compromised offer and the sub-score should say
 * so.
 *
 * Deliberately NOT a hard cap on the overall score. Capping would override the agreed weights,
 * and that is a policy change rather than an implementation detail.
 */
export const FLAG_PENALTIES: Record<RedFlag['severity'], number> = {
    high: 40,
    medium: 15,
    low: 5,
};

/** What a salary percentile was measured against. Two offers are only comparable on equal bases. */
export interface SalaryBasis {
    source: BenchmarkSource;
    scope: BenchmarkScope;
}

export interface ScoreComponent {
    key: ScoreComponentKey;
    label: string;
    /** 0-100 on the component's own terms. `null` means no data, so the weight is redistributed. */
    value: number | null;
    /** Weight actually applied, after redistribution. Zero for components with no data. */
    weight: number;
    /** Why it scored what it did, so a score can be explained rather than just asserted. */
    note: string;
    /** Salary component only, and only when scored. Absent on rows stored before Phase 5. */
    basis?: SalaryBasis;
}

export interface ScoreResult {
    score: number;
    label: string;
    /** 'fallback' tells the UI to label the score an estimate. */
    method: 'standard' | 'fallback';
    components: ScoreComponent[];
    /** Present when a weight was redistributed, per the roadmap's requirement. */
    note: string | null;
}

export interface ScoreInput {
    redFlags: RedFlag[];
    /**
     * `null` when the checklist stage failed (task 15). Benefits and growth then score as
     * unscored and their weight is redistributed, exactly as absent salary data already does —
     * rather than reading as "this offer has no benefits", which is a different claim.
     */
    benefitsChecklist: BenefitsChecklist | null;
    extractedData: AnalysisResult['extractedData'] | null | undefined;
    benefits: AnalysisResult['benefits'];
    /** Percentile from crowdsourced submissions or the public survey, or null (AI-estimated / no CTC). */
    offerPercentile: number | null;
    /** What `offerPercentile` was measured against. Ignored when the percentile is null. */
    salarySource: SalaryBasis['source'];
    salaryScope?: SalaryBasis['scope'];
}

const clamp = (n: number) => Math.max(0, Math.min(100, n));

/** 100 minus severity-weighted penalties. */
export function scoreRedFlags(flags: RedFlag[]): { value: number; note: string } {
    const list = Array.isArray(flags) ? flags : [];
    if (list.length === 0) {
        return { value: 100, note: 'No red flags found in the letter.' };
    }

    const penalty = list.reduce((sum, f) => sum + (FLAG_PENALTIES[f?.severity] ?? 0), 0);
    const counts = { high: 0, medium: 0, low: 0 } as Record<string, number>;
    for (const f of list) counts[f?.severity] = (counts[f?.severity] ?? 0) + 1;

    const described = (['high', 'medium', 'low'] as const)
        .filter((s) => counts[s] > 0)
        .map((s) => `${counts[s]} ${s}`)
        .join(', ');

    return { value: clamp(100 - penalty), note: `${list.length} red flag(s): ${described} severity.` };
}

/**
 * The offer's percentile IS its score, which is the whole appeal: a 0-100 position in the
 * market needs no transformation to become a 0-100 sub-score.
 *
 * Null when the benchmark came from the model rather than from submissions. The previous
 * formula moved the score by up to 20 points on an invented percentile, which is worse than
 * not scoring salary at all — it looks like evidence.
 */
export function scoreSalary(
    offerPercentile: number | null,
    // No default: a caller that forgets it fails `tsc` instead of labelling a survey percentile
    // "crowdsourced submissions".
    source: SalaryBasis['source'],
    scope?: SalaryBasis['scope'],
): { value: number | null; note: string; basis?: SalaryBasis } {
    if (offerPercentile === null || !Number.isFinite(offerPercentile)) {
        return {
            value: null,
            note: 'No salary benchmark with enough data for this role and city, so salary is not scored.',
        };
    }

    const rank = Math.round(offerPercentile);
    const basis: SalaryBasis = { source, scope: scope ?? (source === 'crowdsourced' ? 'role_city' : 'role_national') };

    return {
        value: clamp(offerPercentile),
        basis,
        note: source === 'public_survey'
            ? `Offer sits at roughly the ${rank}th percentile of Stack Overflow Developer Survey 2025 respondents `
                + 'in India (national, not specific to your city)'
                + (basis.scope === 'role_national' ? ' across all experience levels' : '')
            : `Offer sits at roughly the ${rank}th percentile of crowdsourced submissions.`,
    };
}

/**
 * Core benefits carry 75, the notable tier 25.
 *
 * Weighted that way because the core three are near-universal — their absence is a real gap —
 * while gratuity, term life, a learning budget and flexible working are nice rather than
 * expected, so a letter without them should not be marked down heavily.
 */
export function scoreBenefits(checklist: BenefitsChecklist | null): { value: number | null; note: string } {
    if (!checklist) {
        return {
            value: null,
            note: 'The benefits checklist could not be run, so benefits are not scored.',
        };
    }

    const core = checklist?.core ?? [];
    const notable = checklist?.notable ?? [];

    const corePresent = core.filter((e) => e.present).length;
    const notablePresent = notable.filter((e) => e.present).length;

    const coreShare = core.length > 0 ? (corePresent / core.length) * 75 : 0;
    const notableShare = notable.length > 0 ? (notablePresent / notable.length) * 25 : 0;

    return {
        value: clamp(Math.round(coreShare + notableShare)),
        note: `${corePresent} of ${core.length} essential benefits, `
            + `${notablePresent} of ${notable.length} additional ones.`,
    };
}

/**
 * The only growth signals an offer letter actually carries: money for learning, and equity.
 *
 * Deliberately narrow. Career trajectory is generated on demand from the role and is not part
 * of the analysis, and inferring growth from a job title would be invention. An offer with
 * neither signal is not a bad offer — it has less measurable upside, which is what a 10-point
 * component should express.
 */
export function scoreGrowth(
    extractedData: ScoreInput['extractedData'],
    checklist: BenefitsChecklist | null,
): { value: number | null; note: string } {
    if (!checklist) {
        // Not scored on equity alone. Half this component's evidence comes from the checklist, so
        // without it a letter that does fund learning would read as one that does not — an
        // understated score presented as a measured one.
        return {
            value: null,
            note: 'Growth needs the benefits checklist, which could not be run, so it is not scored.',
        };
    }

    const hasLearning = (checklist?.notable ?? []).some((e) => e.key === 'learning' && e.present);
    const equity = extractedData?.compensation?.equity;
    const hasEquity = Boolean(equity && (equity.quantity || equity.type));

    const signals = [
        hasEquity ? 'equity' : null,
        hasLearning ? 'a learning budget' : null,
    ].filter(Boolean) as string[];

    const value = (hasEquity ? 50 : 0) + (hasLearning ? 50 : 0);

    return {
        value,
        note: signals.length > 0
            ? `Offers ${signals.join(' and ')}.`
            : 'No equity and no learning budget stated — less measurable upside.',
    };
}

/**
 * How much the employer put in writing.
 *
 * The one component measuring the letter's candour rather than its contents, and the one an
 * employer could fix for free. Each signal is something a straightforward offer states and a
 * vague one omits.
 */
export function scoreTransparency(
    extractedData: ScoreInput['extractedData'],
    benefits: AnalysisResult['benefits'],
    flags: RedFlag[],
): { value: number; note: string } {
    const compensation = extractedData?.compensation;
    const benefitList = Array.isArray(benefits) ? benefits : [];

    /**
     * Each signal carries its own phrasing for when it is absent.
     *
     * Not derived from the label: negating a label mechanically produces double negatives —
     * "Not stated: pay not left to discretion" — which is what a first pass rendered.
     */
    const signals: Array<{ met: boolean; whenMissing: string }> = [
        // Basic stated as its own figure rather than only a lump CTC.
        {
            met: Boolean(compensation?.baseSalary?.amount),
            whenMissing: 'basic pay is not broken out of the total',
        },
        {
            met: Boolean(extractedData?.noticePeriod),
            whenMissing: 'no notice period is stated',
        },
        {
            met: (compensation?.otherComponents?.length ?? 0) > 0,
            whenMissing: 'pay components are not itemised',
        },
        // A benefit with a number attached, rather than a bare name.
        {
            met: benefitList.some((b) => Boolean(b?.value) || /\d/.test(String(b?.details ?? ''))),
            whenMissing: 'benefits are named but not quantified',
        },
        // Reuses the flag the rules and model already produce rather than re-deriving vagueness.
        {
            met: !(Array.isArray(flags) ? flags : []).some((f) => f?.type === 'vague_compensation'),
            whenMissing: 'part of the pay is left to the employer’s discretion',
        },
    ];

    const missing = signals.filter((s) => !s.met).map((s) => s.whenMissing);
    const met = signals.length - missing.length;

    return {
        value: clamp(Math.round((met / signals.length) * 100)),
        note: missing.length === 0
            ? 'Everything a clear offer should state is stated.'
            : `${missing.join('; ')}.`,
    };
}

export function labelFor(score: number): string {
    if (score >= 90) return 'excellent';
    if (score >= 75) return 'good';
    if (score >= 60) return 'fair';
    if (score >= 40) return 'weak';
    return 'poor';
}

export function calculateScore(input: ScoreInput): ScoreResult {
    const redFlags = scoreRedFlags(input.redFlags);
    const salary = scoreSalary(input.offerPercentile, input.salarySource, input.salaryScope);
    const benefits = scoreBenefits(input.benefitsChecklist);
    const growth = scoreGrowth(input.extractedData, input.benefitsChecklist);
    const transparency = scoreTransparency(input.extractedData, input.benefits, input.redFlags);

    const raw: Array<{ key: ScoreComponentKey; label: string; value: number | null; note: string; basis?: SalaryBasis }> = [
        { key: 'redFlags', label: 'Red flags', ...redFlags },
        { key: 'salary', label: 'Salary vs market', ...salary },
        { key: 'benefits', label: 'Benefits', ...benefits },
        { key: 'growth', label: 'Growth signals', ...growth },
        { key: 'transparency', label: 'Transparency', ...transparency },
    ];

    const scored = raw.filter((c) => c.value !== null);
    const unscored = raw.filter((c) => c.value === null);

    // Redistribute the weight of anything unscored, proportionally across what remains. Scoring
    // an absent component as zero would penalise the offer for a gap in our data.
    const scoredWeight = scored.reduce((sum, c) => sum + COMPONENT_WEIGHTS[c.key], 0);
    const scale = scoredWeight > 0 ? 100 / scoredWeight : 0;

    const components: ScoreComponent[] = raw.map((c) => ({
        key: c.key,
        label: c.label,
        value: c.value,
        weight: c.value === null ? 0 : Math.round(COMPONENT_WEIGHTS[c.key] * scale),
        note: c.note,
        ...(c.basis && { basis: c.basis }),
    }));

    // Computed from exact weights rather than the rounded display ones, so the parts always sum
    // to the whole.
    const score = scoredWeight > 0
        ? Math.round(scored.reduce((sum, c) => sum + (c.value! * COMPONENT_WEIGHTS[c.key] * scale), 0) / 100)
        : 0;

    return {
        score: clamp(score),
        label: labelFor(clamp(score)),
        method: unscored.length === 0 ? 'standard' : 'fallback',
        components,
        note: unscored.length > 0
            ? `Score based on limited market data — ${unscored.map((c) => c.label.toLowerCase()).join(', ')} `
                + 'could not be scored, so the remaining factors carry more weight.'
            : null,
    };
}
