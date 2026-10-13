import type { TokenUsage } from '@/providers/ai/usage.js';
import type { TakeHomeResult } from '@/modules/takehome/takehome.calculator.js';
import type { BenefitsChecklist } from '@/modules/benefits/benefits.checklist.js';
import type { ScoreComponent } from './score.rubric.js';
import type { ConfidenceReport } from './confidence.js';
import type { DATA_SOURCES } from './analysis.zod.js';
import type { BenchmarkScope } from '@/modules/salary/salary.service.js';

export interface AnalysisResult {
    extractedData: {
        companyName: string | null;
        role: string | null;
        department: string | null;
        joiningDate: string | null;
        location: string | null;
        /** Task 7: CareerService was called with a hardcoded 'Technology' before these existed. */
        industry: string | null;
        companyType: string | null;
        employmentType: 'full-time' | 'part-time' | 'contract' | 'intern';
        compensation: Compensation;
        noticePeriod: string | null;
        probationPeriod: string | null;
    };
    redFlags: RedFlag[];
    salaryComparison: SalaryComparison;
    negotiationSuggestions: NegotiationSuggestion[];
    benefits: Benefit[];
    /**
     * REMOVED from the provider contract in Phase 2 task 9.
     *
     * The model used to be asked for a monthly take-home figure and answered plausibly —
     * about 82% of gross, which is roughly right at 24 LPA and wrong at 8 or 80, with nothing
     * in the output to say which. Tax is arithmetic, so it is now computed by the worker from
     * published slabs and appears on `AnalysisResponse` instead, alongside `score`.
     *
     * Deliberately not just ignored: it is out of the response schema entirely, so we stop
     * paying output tokens for a number that gets discarded.
     */
    metadata: {
        analysisVersion: string;
        modelUsed: string;
        processingNote: string | null;
        /**
         * What the call cost, in tokens.
         *
         * Attached by the provider AFTER Zod validation, so it survives the schema strip
         * and lands in `analyses.aiMetadata`. Absent when the provider does not report
         * usage. Covers every call the analysis took, including validation retries and
         * fallbacks to another model — all of which are billed.
         */
        usage?: TokenUsage | null;
    };
}

export interface Compensation {
    currency: string;
    /**
     * `null` when the letter states only a total and never breaks out basic pay — which is
     * most Indian offer letters. Previously coerced to `{ amount: 0 }`, which was
     * indistinguishable from a real zero and hid the fact that nothing had been extracted.
     */
    baseSalary: { amount: number | null; period: 'monthly' | 'annual' } | null;
    variablePay: { amount: number | null; type: string | null; details: string | null } | null;
    equity: { type: string | null; quantity: number | null; vestingSchedule: string | null; strikePrice: number | null; cliffMonths: number | null } | null;
    totalCTC: number | null;
    otherComponents: { name: string; amount: number | null; details: string | null }[];
}

export interface RedFlag {
    type: 'non_compete' | 'bond' | 'vague_compensation' | 'missing_benefit' | 'clawback' | 'ip_assignment' | 'probation' | 'other';
    severity: 'high' | 'medium' | 'low';
    title: string;
    explanation: string;
    matchedText: string;
    suggestion: string;
}

export interface SalaryComparison {
    marketRange: { p25: number; p50: number; p75: number; p90: number };
    /** Null when the letter states no CTC to rank (a benchmark range can still be shown). */
    offerPercentile: number | null;
    roleUsed: string;
    roleMatchConfidence: number;
    locationUsed: string;
    dataSource: (typeof DATA_SOURCES)[number];
    disclaimer: string | null;
    /** Additive, set by the worker for crowdsourced and public_survey benchmarks. */
    sampleSize?: number;
    benchmarkScope?: BenchmarkScope;
    experienceBracket?: string | null;
    /** 5.6: set when the offer was not ranked because the survey has no respondents at its experience level. */
    percentileWithheld?: 'no_experience_rows' | null;
    /** 5.7, crowdsourced only: which kind of pay served the number ('mixed' = pooled). Absent on older analyses. */
    payBasis?: 'offered' | 'current' | 'mixed' | null;
    /** 5.7, 'mixed' only: data points by kind, summing to `sampleSize`. */
    payMix?: { offered: number; current: number; unlabelled: number } | null;
}

export interface NegotiationSuggestion {
    component: string;
    currentValue: string;
    suggestedAsk: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
}

export interface Benefit {
    name: string;
    value: string | null;
    details: string | null;
    isStandard: boolean;
}

/**
 * What `GET /offers/:id/analysis` returns.
 *
 * `AnalysisResult` is the AI provider's output contract, so it deliberately carries no
 * score and no offer context. The results view needs both: the score is computed by the
 * worker after the AI returns, and `expiresAt` / `ocrConfidence` / `status` live on the
 * offer row.
 *
 * Previously the route returned bare `AnalysisResult`, so the score — the product's
 * headline number — was computed, stored, and then never sent to the browser.
 */
export interface AnalysisResponse extends AnalysisResult {
    /** 0-100 composite. Computed in the analysis worker, not by the AI. */
    score: number;
    /**
     * Deterministic take-home, computed from published tax slabs rather than guessed.
     *
     * Null when the letter states no usable CTC. Carries a range rather than one number
     * because PF depends on basic pay and on employer policy, neither of which an offer letter
     * reliably states — see `takehome.calculator.ts`.
     */
    takeHome: TakeHomeResult | null;

    /**
     * What a normal offer has, and what this one does not.
     *
     * Computed on read rather than stored, because it is a pure function of `benefits` — which
     * IS stored — so there is nothing to migrate and it can never drift out of step with the
     * current checklist definition. Old analyses pick up a revised list automatically, which is
     * what you want from a display aid.
     *
     * Nullable since task 15: the checklist is an optional stage, and returning null keeps the
     * rest of a completed analysis reachable rather than 500ing the results page on every visit.
     * The UI section is already guarded on it.
     */
    benefitsChecklist: BenefitsChecklist | null;

    /**
     * How the score was arrived at: each component's sub-score, the weight actually applied
     * after redistribution, and a plain-language reason.
     *
     * Null for analyses produced before task 10, which stored only the number.
     */
    scoreBreakdown: ScoreComponent[] | null;
    /** Set when a weight was redistributed, e.g. no salary benchmark with enough data for this role and city. */
    scoreNote: string | null;

    /**
     * How much to trust each part of this analysis, derived from checkable evidence rather than
     * asked of the model.
     *
     * Verbatim presence in the letter, provenance of the benchmark, whether a value was computed
     * or generated, and whether the text came from a scan. See `confidence.ts` for why a
     * model-reported confidence number would have been worse than none.
     */
    confidence: ConfidenceReport;
    scoreLabel: string;
    /** 'standard' | 'fallback' — 'fallback' means the UI should say "estimated". */
    scoringMethod: string;
    lowConfidence: boolean;
    /** Red flags dropped by the hallucination guard because their quote wasn't in the text. */
    redFlagsDiscarded: number;
    /** Offer-level context the results view needs. */
    offerStatus: string;
    expiresAt: Date | null;
    ocrConfidence: number | null;
}

/**
 * DEAD as written — nothing produced or read it, and its shape predates the rubric: no
 * transparency component, and a `totalScore` duplicating the `score` column.
 *
 * The real breakdown is `ScoreComponent[]` from `score.rubric.ts`, exposed on
 * `AnalysisResponse.scoreBreakdown`. Left here only so the removal is explicit rather than a
 * silent deletion in a diff.
 *
 * @deprecated Use `ScoreComponent` from `score.rubric.ts`.
 */
export interface UnusedLegacyScoreBreakdown {
    salaryScore: number;
    redFlagScore: number;
    benefitsScore: number;
    growthScore: number;
    totalScore: number;
}
