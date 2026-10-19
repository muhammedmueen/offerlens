import { z } from 'zod';
import { SchemaType, type Schema } from '@google/generative-ai';

/**
 * The analysis contract, enforced in three places (Phase 1 tasks 3-5, option A).
 *
 * Before this, the prompt ended with "Output compliant JSON matching the AnalysisResult
 * interface" — an interface the model had never seen. It invented a plausible shape each
 * time, and the eval measured 16 different shapes across 16 cases, none of which the code
 * could read. `role` and `totalCTC` scored 0% while the model was extracting them
 * correctly the whole time, just under names like `job_title` and `annual_compensation`.
 *
 * Three layers now:
 *   1. GEMINI_RESPONSE_SCHEMA — enforced by the model itself, so the shape is structurally
 *      correct before we ever see it.
 *   2. analysisResultSchema — Zod, which validates and fills defaults for anything the
 *      model omits, so downstream code gets a guaranteed shape.
 *   3. describeSchemaForPrompt() — the same field list rendered into the prompt, because
 *      responseSchema constrains structure but not meaning; the model still needs to be
 *      told what `matchedText` is for.
 *
 * Keep all three in step. A field added to one and not the others is how drift starts.
 */

// ── enums, shared between Zod and the Gemini schema ────────────────────────
export const RED_FLAG_TYPES = [
    'non_compete', 'bond', 'vague_compensation', 'missing_benefit',
    'clawback', 'ip_assignment', 'probation', 'other',
] as const;

export const SEVERITIES = ['high', 'medium', 'low'] as const;
export const PRIORITIES = ['high', 'medium', 'low'] as const;
export const EMPLOYMENT_TYPES = ['full-time', 'part-time', 'contract', 'intern'] as const;
export const PAY_PERIODS = ['monthly', 'annual'] as const;
/** Stored-type and read-side vocabulary. 'public_survey' is set only by the worker's benchmark path. */
export const DATA_SOURCES = ['ai_estimated', 'crowdsourced', 'public_survey'] as const;
/**
 * What the MODEL may say. Byte-identical to the pre-Phase-5 list so PROMPT_FINGERPRINT (which hashes the
 * response schema) is unchanged and the model can never claim the new source.
 */
export const MODEL_DATA_SOURCES = ['ai_estimated', 'crowdsourced'] as const;

/** Accept null, undefined, or the empty string as "absent". Models use all three. */
const nullableString = z.preprocess(
    (v) => (v === '' || v === undefined ? null : v),
    z.string().nullable().catch(null),
);

/**
 * Numbers arrive as strings surprisingly often ("2400000", "24,00,000").
 * Coerce, strip grouping, and fall back to null rather than failing the whole parse.
 */
const nullableNumber = z.preprocess((v) => {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    if (typeof v === 'string') {
        const cleaned = v.replace(/[,\s₹$€£]/g, '');
        const n = Number(cleaned);
        return Number.isFinite(n) ? n : null;
    }
    return null;
}, z.number().nullable().catch(null));

// ── Zod: validate and normalise what came back ─────────────────────────────
export const compensationSchema = z.object({
    currency: nullableString.transform((v) => v ?? 'INR'),
    /**
     * Nullable, and NOT coerced to zero.
     *
     * This used to be `.transform(v => v ?? 0).catch({ amount: 0, period: 'annual' })`, so an
     * absent basic became the number 0 — indistinguishable from a real zero, and impossible
     * for a caller to detect. Combined with `required: ['baseSalary']` in the response schema,
     * the model had to supply a figure for letters that state only a CTC, and the only figure
     * available was the CTC itself. The eval measured that happening on 5 of 17 cases, in
     * every one of 3 passes.
     *
     * Indian basic is typically 40-50% of CTC, so base == CTC is not a rounding difference. It
     * sets the PTO daily rate in benefits.calculator.ts and it drives PF, which is 12% of
     * basic — feeding it into a tax calculator would produce confidently wrong take-home.
     *
     * `null` now means "the letter does not say", which is a fact the calculator can act on.
     */
    baseSalary: z.object({
        amount: nullableNumber,
        period: z.enum(PAY_PERIODS).catch('annual'),
    }).nullable().catch(null),
    variablePay: z.object({
        amount: nullableNumber,
        type: nullableString,
        details: nullableString,
    }).nullable().catch(null),
    equity: z.object({
        type: nullableString,
        quantity: nullableNumber,
        vestingSchedule: nullableString,
        strikePrice: nullableNumber,
        cliffMonths: nullableNumber,
    }).nullable().catch(null),
    totalCTC: nullableNumber,
    otherComponents: z.array(z.object({
        name: z.string().catch('Unnamed'),
        amount: nullableNumber,
        details: nullableString,
    })).catch([]),
});

export const extractedDataSchema = z.object({
    companyName: nullableString,
    role: nullableString,
    department: nullableString,
    joiningDate: nullableString,
    location: nullableString,
    // Added in task 7. CareerService was called with a hardcoded
    // industry: 'Technology' / companyType: 'Unknown', which is why its output was generic.
    industry: nullableString,
    companyType: nullableString,
    employmentType: z.enum(EMPLOYMENT_TYPES).catch('full-time'),
    compensation: compensationSchema,
    noticePeriod: nullableString,
    probationPeriod: nullableString,
});

export const redFlagSchema = z.object({
    type: z.enum(RED_FLAG_TYPES).catch('other'),
    severity: z.enum(SEVERITIES).catch('medium'),
    title: z.string().catch('Unnamed concern'),
    explanation: z.string().catch(''),
    // Must be a verbatim quote. The worker's hallucination guard drops any flag whose
    // matchedText is absent from the source, so an empty value means the flag is discarded.
    matchedText: z.string().catch(''),
    suggestion: z.string().catch(''),
});

export const salaryComparisonSchema = z.object({
    marketRange: z.object({
        // MONEY-2: a missing figure stays null. Defaulting to 0 drew four Rs 0 bars, and
        // defaulting the percentile to 50 printed an invented "50th percentile".
        p25: nullableNumber,
        p50: nullableNumber,
        p75: nullableNumber,
        p90: nullableNumber,
    }).catch({ p25: null, p50: null, p75: null, p90: null }),
    offerPercentile: nullableNumber,
    roleUsed: z.string().catch('unknown'),
    roleMatchConfidence: nullableNumber.transform((v) => v ?? 0),
    locationUsed: z.string().catch('unknown'),
    // The model must always say 'ai_estimated'. Only Phase 1 task 2, reading the
    // crowdsourced table, is allowed to set 'crowdsourced'; the worker sets 'public_survey'.
    dataSource: z.enum(MODEL_DATA_SOURCES).catch('ai_estimated'),
    disclaimer: nullableString,
});

export const negotiationSuggestionSchema = z.object({
    component: z.string().catch('General'),
    currentValue: z.string().catch(''),
    suggestedAsk: z.string().catch(''),
    rationale: z.string().catch(''),
    priority: z.enum(PRIORITIES).catch('medium'),
});

export const benefitSchema = z.object({
    name: z.string().catch('Unknown'),
    value: nullableString,
    details: nullableString,
    isStandard: z.boolean().catch(true),
});

export const analysisResultSchema = z.object({
    extractedData: extractedDataSchema,
    redFlags: z.array(redFlagSchema).catch([]),
    salaryComparison: salaryComparisonSchema,
    negotiationSuggestions: z.array(negotiationSuggestionSchema).catch([]),
    benefits: z.array(benefitSchema).catch([]),
    // `takeHome` is gone: it is computed by the worker from published tax slabs, not asked of
    // the model. See analysis.types.ts. z.object strips it if a model sends one anyway.
    metadata: z.object({
        analysisVersion: z.string().catch('1.0'),
        modelUsed: z.string().catch('unknown'),
        processingNote: nullableString,
    }).catch({ analysisVersion: '1.0', modelUsed: 'unknown', processingNote: null }),
});

export type ValidatedAnalysis = z.infer<typeof analysisResultSchema>;

// ── Gemini: enforce the shape at the model ─────────────────────────────────
const str = (description: string): Schema =>
    ({ type: SchemaType.STRING, description, nullable: true } as Schema);
const num = (description: string): Schema =>
    ({ type: SchemaType.NUMBER, description, nullable: true } as Schema);

/**
 * Passed as `generationConfig.responseSchema`, which makes the model emit this structure
 * rather than one of its own invention. This is the single highest-leverage change in
 * Phase 1 — the eval baseline of 4.2% on structured fields was almost entirely a
 * key-naming mismatch, not a comprehension failure.
 */
export const GEMINI_RESPONSE_SCHEMA: Schema = {
    type: SchemaType.OBJECT,
    properties: {
        extractedData: {
            type: SchemaType.OBJECT,
            properties: {
                companyName: str('Employer legal name exactly as written. null if absent.'),
                role: str('Job title exactly as written in the letter.'),
                department: str('Team or department, if named.'),
                joiningDate: str('Start date as written.'),
                location: str('Primary work city or office. "Remote" if fully remote.'),
                industry: str('Industry sector, e.g. Technology, Financial Services, Education.'),
                companyType: str('One of: product, service, startup, mnc, government, education, other.'),
                employmentType: {
                    type: SchemaType.STRING,
                    format: 'enum',
                    enum: [...EMPLOYMENT_TYPES],
                    description: 'Employment basis.',
                } as Schema,
                compensation: {
                    type: SchemaType.OBJECT,
                    properties: {
                        currency: str('ISO code, e.g. INR, USD. Infer from symbols or wording.'),
                        baseSalary: {
                            type: SchemaType.OBJECT,
                            // Nullable, and dropped from the parent's `required` list. It used
                            // to be mandatory, which forced the model to invent a basic figure
                            // for the many letters that quote only a CTC — and the only number
                            // available was the CTC, so base came back equal to total on 5 of
                            // 17 eval cases.
                            nullable: true,
                            properties: {
                                amount: num(
                                    'Basic pay ONLY if the letter states it as its own figure. '
                                    + 'Return null when the letter gives just a total, a CTC, or '
                                    + '"cost to company" — do NOT reuse the total here, and do not '
                                    + 'estimate a percentage of it. Basic is a separate line item.',
                                ),
                                period: {
                                    type: SchemaType.STRING, format: 'enum',
                                    enum: [...PAY_PERIODS],
                                    description: 'Whether the base figure is monthly or annual.',
                                } as Schema,
                            },
                            required: ['amount', 'period'],
                        } as Schema,
                        variablePay: {
                            type: SchemaType.OBJECT, nullable: true,
                            properties: {
                                amount: num('Maximum variable or bonus amount.'),
                                type: str('e.g. performance bonus, sales incentive.'),
                                details: str('Conditions attached.'),
                            },
                        } as Schema,
                        equity: {
                            type: SchemaType.OBJECT, nullable: true,
                            properties: {
                                type: str('e.g. ESOP, RSU, options.'),
                                quantity: num('Number of units or options.'),
                                vestingSchedule: str('Vesting terms as written.'),
                                strikePrice: num('Strike or exercise price per unit.'),
                                cliffMonths: num('Cliff length in months.'),
                            },
                        } as Schema,
                        totalCTC: num(
                            'ANNUAL total cost to company as an absolute number. Annualise a '
                            + 'monthly figure by multiplying by 12. Expand magnitude words: '
                            + '"5 lakh" is 500000, "1.4 crore" is 14000000, "32 LPA" is 3200000. '
                            + 'Where the letter states a total, use it; otherwise sum the components.',
                        ),
                        otherComponents: {
                            type: SchemaType.ARRAY,
                            items: {
                                type: SchemaType.OBJECT,
                                properties: {
                                    name: str('Component name, e.g. House Rent Allowance.'),
                                    amount: num('Annual amount.'),
                                    details: str('Any conditions.'),
                                },
                                required: ['name'],
                            } as Schema,
                        } as Schema,
                    },
                    required: ['currency', 'totalCTC'],
                } as Schema,
                noticePeriod: str('Notice period as written, e.g. "60 days".'),
                probationPeriod: str('Probation length as written, e.g. "6 months".'),
            },
            required: ['companyName', 'role', 'location', 'compensation'],
        } as Schema,

        redFlags: {
            type: SchemaType.ARRAY,
            description:
                'Terms that disadvantage the candidate. Include a flag ONLY when the letter '
                + 'contains text supporting it. Do not infer, and do not pad the list.',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    type: {
                        type: SchemaType.STRING, format: 'enum', enum: [...RED_FLAG_TYPES],
                        description:
                            'non_compete: post-employment competition restrictions. '
                            + 'bond: minimum service commitment. '
                            + 'clawback: repayment of bonus, training or relocation costs. '
                            + 'ip_assignment: broad assignment of intellectual property. '
                            + 'vague_compensation: discretionary or unquantified pay. '
                            + 'probation: harsh probation terms, e.g. termination without notice. '
                            + 'missing_benefit: a benefit a candidate would normally expect is absent. '
                            + 'other: anything else, including at-will clauses.',
                    } as Schema,
                    severity: {
                        type: SchemaType.STRING, format: 'enum', enum: [...SEVERITIES],
                        description: 'high: materially harmful. medium: worth negotiating. low: note only.',
                    } as Schema,
                    title: str('Short label, under 60 characters.'),
                    explanation: str('Why this disadvantages the candidate, in plain language.'),
                    matchedText: str(
                        'A VERBATIM quote from the letter, copied exactly. Required: flags whose '
                        + 'quote cannot be found in the source text are discarded.',
                    ),
                    suggestion: str('What the candidate should ask for instead.'),
                },
                required: ['type', 'severity', 'title', 'explanation', 'matchedText'],
            } as Schema,
        } as Schema,

        salaryComparison: {
            type: SchemaType.OBJECT,
            properties: {
                marketRange: {
                    type: SchemaType.OBJECT,
                    properties: {
                        p25: num('25th percentile annual total, same currency as the offer.'),
                        p50: num('Median annual total.'),
                        p75: num('75th percentile annual total.'),
                        p90: num('90th percentile annual total.'),
                    },
                    required: ['p25', 'p50', 'p75', 'p90'],
                } as Schema,
                offerPercentile: num('Where this offer sits in that range, 0-100.'),
                roleUsed: str('The role you benchmarked against.'),
                roleMatchConfidence: num('0-1 confidence that roleUsed matches the actual role.'),
                locationUsed: str('The market you benchmarked against.'),
                dataSource: {
                    type: SchemaType.STRING, format: 'enum', enum: [...MODEL_DATA_SOURCES],
                    description: 'Always "ai_estimated". You have no access to real submission data.',
                } as Schema,
                disclaimer: str('State plainly that this is an estimate, and any caveat.'),
            },
            required: ['marketRange', 'offerPercentile', 'dataSource'],
        } as Schema,

        negotiationSuggestions: {
            type: SchemaType.ARRAY,
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    component: str('What to negotiate, e.g. Base Salary, Notice Period.'),
                    currentValue: str('What the letter currently offers.'),
                    suggestedAsk: str('A specific, concrete ask including a number where possible.'),
                    rationale: str('The justification to use.'),
                    priority: {
                        type: SchemaType.STRING, format: 'enum', enum: [...PRIORITIES],
                        description: 'Which asks matter most.',
                    } as Schema,
                },
                required: ['component', 'suggestedAsk', 'rationale', 'priority'],
            } as Schema,
        } as Schema,

        benefits: {
            type: SchemaType.ARRAY,
            description: 'Every benefit named in the letter. Do not invent standard ones that are absent.',
            items: {
                type: SchemaType.OBJECT,
                properties: {
                    name: str('Benefit name, e.g. Group Health Insurance, Paid Leave.'),
                    value: str('The stated amount or quantity, e.g. "5,00,000" or "22 days".'),
                    details: str('The relevant phrase from the letter.'),
                    isStandard: {
                        type: SchemaType.BOOLEAN,
                        description: 'True if commonly expected in this market.',
                    } as Schema,
                },
                required: ['name'],
            } as Schema,
        } as Schema,

        // takeHome is deliberately absent. It is computed from published tax slabs in
        // `takehome.calculator.ts`, so asking the model for it would spend output tokens on a
        // number that is then thrown away — and invite the two to disagree on screen.

        metadata: {
            type: SchemaType.OBJECT,
            properties: {
                // analysisVersion and modelUsed are deliberately absent, for the same reason
                // takeHome is: both are facts about OUR request, not about the letter, and the
                // server overwrites whatever arrives here. Asking for them spent output tokens
                // on values that were discarded — and `analysisVersion: 'Always "1.0"'` kept
                // reporting 1.0 through a complete prompt rewrite, because a model cannot know
                // which revision of a prompt it was sent. Set in base.ai.ts.
                processingNote: str('Anything that limited the analysis, e.g. unreadable text.'),
            },
        } as Schema,
    },
    required: ['extractedData', 'redFlags', 'salaryComparison', 'negotiationSuggestions', 'benefits'],
};
