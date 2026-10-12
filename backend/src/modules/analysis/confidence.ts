import type { AnalysisResult, RedFlag } from './analysis.types.js';
import type { TakeHomeResult } from '@/modules/takehome/takehome.calculator.js';
import { normalise, detectRedFlags } from './redflag.rules.js';

/**
 * Per-field confidence (Phase 2 task 11).
 *
 * ── WHY NOT ASK THE MODEL ────────────────────────────────────────────────────
 * The obvious implementation is to add a `confidence` number to the response schema and let the
 * model fill it in. That produces a number that looks like information and is not: models are
 * systematically overconfident and report near-certainty almost everywhere, so the field would
 * be ~0.9 on the values it read correctly AND on the ones it invented. A confidence signal that
 * does not move when the answer is wrong is worse than none, because it launders a guess as a
 * measurement.
 *
 * There is already precedent for this in the codebase: `salaryComparison.roleMatchConfidence`
 * was a model-supplied number, and it had to be overwritten with a hardcoded 1 once the
 * benchmark came from real data, precisely because the model's version meant nothing.
 *
 * ── SO IT IS DERIVED FROM EVIDENCE ───────────────────────────────────────────
 * Four kinds, all checkable:
 *
 *   1. VERBATIM  — does the extracted value actually appear in the letter? A company name that
 *                  cannot be found was inferred, not read. Same trick as the red-flag
 *                  hallucination guard, applied to scalars.
 *   2. PROVENANCE — did the number come from real submissions (high), a public survey (medium)
 *                  or the model's impression (low)? Already tracked on `salaryComparison.dataSource`.
 *   3. DERIVATION — was it computed by us (tax slabs, set difference against a benefits list) or
 *                  produced by the model? Arithmetic does not need a confidence tag.
 *   4. INPUT QUALITY — text that went through OCR is less trustworthy than text a human pasted,
 *                  regardless of what the OCR engine claimed about itself.
 *
 * Computed on read rather than stored, like the benefits checklist. It is a pure function of
 * data that is already persisted — the analysis plus `offers.rawText` — so there is nothing to
 * migrate, and it stays in step when a rule here improves. Deliberately the opposite choice from
 * `scoreBreakdown`, which IS stored: the score's parts must sum to the number that was recorded,
 * whereas confidence is a live assessment with no stored counterpart to contradict.
 */

export type ConfidenceLevel = 'high' | 'medium' | 'low';

export interface FieldConfidence {
    level: ConfidenceLevel;
    /** Shown to the user. Says what the evidence was, not just how sure we are. */
    reason: string;
}

export interface ConfidenceReport {
    fields: Record<string, FieldConfidence>;
    /** Worst level among the fields that anchor everything else. */
    overall: ConfidenceLevel;
    /** Set when something limits the whole report, e.g. the source was scanned rather than typed. */
    caveat: string | null;
}

const RANK: Record<ConfidenceLevel, number> = { high: 3, medium: 2, low: 1 };
const worst = (levels: ConfidenceLevel[]): ConfidenceLevel =>
    levels.reduce<ConfidenceLevel>((lowest, l) => (RANK[l] < RANK[lowest] ? l : lowest), 'high');

/** One level down, floored at low. */
const downgrade = (level: ConfidenceLevel): ConfidenceLevel =>
    level === 'high' ? 'medium' : 'low';

/** Magnitude words that mean a figure was expanded rather than copied. */
const MAGNITUDE_WORDS = ['lakh', 'lac', 'crore', 'cr', 'lpa', 'k'];

/**
 * Is this string present in the letter?
 *
 * Normalised on both sides so hyphenation and spacing differences do not read as absence.
 */
export function appearsVerbatim(value: string | null | undefined, normalisedText: string): boolean {
    if (!value || !normalisedText) return false;
    const needle = normalise(value);
    return needle.length > 0 && normalisedText.includes(needle);
}

/**
 * How directly a number can be traced to the letter.
 *
 * `exact`    the digits are there, separators aside — "₹24,00,000" for 2400000
 * `expanded` a magnitude word did the work — "24 LPA" for 2400000, correct but not copied
 * `absent`   neither, so the figure was inferred from something else
 *
 * The distinction matters because expansion is where magnitude bugs live. It was worth five
 * orders of magnitude in the benefits calculator before `extractMoney` handled units.
 */
export function traceNumber(
    value: number | null | undefined,
    rawText: string,
): 'exact' | 'expanded' | 'absent' {
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0 || !rawText) return 'absent';

    // Strip digit-group separators so "24,00,000" and "2 400 000" both become "2400000".
    const digitsOnly = rawText.replace(/[,\s]/g, '');
    if (digitsOnly.includes(String(value))) return 'exact';

    // A magnitude word plus the leading significant digits: "24 LPA", "1.4 crore".
    //
    // Decimal points are stripped for this check only. "₹1.4 crore" expands to 14000000, whose
    // lead is "14", and that does not appear in "1.4" until the point goes. The exact check above
    // stays strict; loosening it here is the right trade, because a false `absent` accuses the
    // model of inventing a figure it actually read correctly.
    const lower = rawText.toLowerCase();
    const hasMagnitude = MAGNITUDE_WORDS.some((w) => lower.includes(w));
    if (hasMagnitude) {
        const lead = String(value).replace(/0+$/, '');
        if (lead.length > 0 && digitsOnly.replace(/\./g, '').includes(lead)) return 'expanded';
    }

    return 'absent';
}

function verbatimField(
    value: string | null | undefined,
    normalisedText: string,
    label: string,
): FieldConfidence {
    if (!value) {
        // We cannot verify an absence — extraction may simply have missed it. So this is never
        // `high`, however plainly the letter seems to omit it.
        return { level: 'medium', reason: `The letter does not appear to state the ${label}.` };
    }

    return appearsVerbatim(value, normalisedText)
        ? { level: 'high', reason: `Found word-for-word in the letter.` }
        : {
            level: 'low',
            reason: `Could not be found in the letter, so the ${label} was inferred rather than read. `
                + 'Worth checking against your copy.',
        };
}

export interface ConfidenceInput {
    extractedData: AnalysisResult['extractedData'] | null | undefined;
    redFlags: RedFlag[];
    benefits: AnalysisResult['benefits'];
    salaryComparison: AnalysisResult['salaryComparison'] | null | undefined;
    takeHome: TakeHomeResult | null;
    /** The letter itself. Null when it has been cleaned up, which disables verbatim checks. */
    rawText: string | null;
    /** Null when the user pasted text rather than uploading a scan. */
    ocrConfidence: number | null;
}

export function assessConfidence(input: ConfidenceInput): ConfidenceReport {
    const { extractedData: ex, rawText, ocrConfidence } = input;
    const text = rawText ?? '';
    const normalisedText = normalise(text);
    const compensation = ex?.compensation;

    const fields: Record<string, FieldConfidence> = {};

    // ── Verbatim-checkable scalars ──
    if (normalisedText) {
        fields.companyName = verbatimField(ex?.companyName, normalisedText, 'company name');
        fields.role = verbatimField(ex?.role, normalisedText, 'job title');
        fields.location = verbatimField(ex?.location, normalisedText, 'location');
        fields.noticePeriod = verbatimField(ex?.noticePeriod, normalisedText, 'notice period');
        fields.probationPeriod = verbatimField(ex?.probationPeriod, normalisedText, 'probation period');
    }

    // ── Numbers ──
    //
    // "No total was extracted" and "a total was extracted but is nowhere in the letter" are
    // different failures and must not share a message: the first is the letter being silent, the
    // second is the model inventing a figure.
    if (typeof compensation?.totalCTC !== 'number' || compensation.totalCTC <= 0) {
        fields.totalCTC = {
            level: 'medium',
            reason: 'No total compensation figure was read from the letter.',
        };
    } else {
        fields.totalCTC = {
            exact: { level: 'high' as const, reason: 'The figure appears in the letter as written.' },
            expanded: {
                level: 'medium' as const,
                reason: 'Stated with a magnitude word such as "lakh" or "LPA", so the full figure is '
                    + 'expanded rather than copied. Worth a second look at the zeroes.',
            },
            absent: {
                level: 'low' as const,
                reason: 'Could not be matched to a figure in the letter, so it was inferred.',
            },
        }[traceNumber(compensation.totalCTC, text)];
    }

    fields.baseSalary = compensation?.baseSalary?.amount
        ? (traceNumber(compensation.baseSalary.amount, text) === 'absent'
            ? { level: 'low', reason: 'Basic pay could not be matched to a figure in the letter.' }
            : { level: 'high', reason: 'Basic pay is stated as its own figure in the letter.' })
        : {
            level: 'high',
            reason: 'The letter states only a total, with no separate basic pay — which is normal, '
                + 'and is why PF cannot be calculated exactly.',
        };

    // ── Red flags: deterministic versus model-found ──
    //
    // Re-running the clause rules tells us which flag TYPES the deterministic engine found. Those
    // quote the letter by construction. Types only the model raised needed a judgement, and the
    // model is the half that varies between runs.
    const flags = Array.isArray(input.redFlags) ? input.redFlags : [];
    if (flags.length === 0) {
        fields.redFlags = {
            level: 'high',
            reason: 'Nothing flagged. The clause checks are deterministic, so a clean result here '
                + 'is a real result rather than an absence of effort.',
        };
    } else {
        const deterministicTypes = new Set([
            ...detectRedFlags(text).map((f) => f.type),
            // Owned outright by the benefits checklist, which is a set difference, not a judgement.
            'missing_benefit',
        ]);
        const modelOnly = flags.filter((f) => !deterministicTypes.has(f?.type));

        fields.redFlags = modelOnly.length === 0
            ? {
                level: 'high',
                reason: `All ${flags.length} flag(s) came from deterministic clause checks quoting the letter.`,
            }
            : {
                level: 'medium',
                reason: `${flags.length - modelOnly.length} of ${flags.length} flag(s) came from `
                    + 'deterministic checks; the rest are the model\'s reading and may vary between runs.',
            };
    }

    // ── Salary benchmark: provenance ──
    const benchmarkSource = input.salaryComparison?.dataSource;
    fields.salaryComparison = benchmarkSource === 'crowdsourced'
        // 'medium', not 'high' (5.4): 'high' renders the green "Verified" badge, and nobody verifies a crowd row.
        ? { level: 'medium', reason: 'Benchmarked against crowdsourced (unverified) salary submissions for this role and city.' }
        : benchmarkSource === 'public_survey'
            ? {
                level: 'medium',
                reason: 'Modelled from a public survey (Stack Overflow Developer Survey 2025, India-wide). '
                    + 'Real data, but self-reported and not specific to your city.',
            }
            : {
                level: 'low',
                reason: 'No salary benchmark with enough data for this role and city, so the range is the '
                    + 'model\'s general impression. Do not quote it as market data.',
            };

    // ── Take-home: ours, so the uncertainty is in the inputs, not the sum ──
    if (input.takeHome) {
        fields.takeHome = input.takeHome.isExact
            ? {
                level: 'high',
                reason: 'Calculated from published tax slabs. Exact, given what the letter states.',
            }
            : {
                level: 'medium',
                reason: 'Tax is calculated from published slabs, but PF depends on your employer\'s '
                    + 'policy, which the letter does not state — hence a range.',
            };
    }

    // ── Benefits: model-extracted list, deterministic verdict ──
    fields.benefits = (Array.isArray(input.benefits) ? input.benefits : []).length > 0
        ? {
            level: 'medium',
            reason: 'The list is read from the letter by the model. Whether anything standard is '
                + 'missing is then checked against a fixed list, which is deterministic.',
        }
        : {
            level: 'medium',
            reason: 'No benefits were read from the letter. That may mean none are offered, or that '
                + 'they are described somewhere the extraction did not reach.',
        };

    // ── Input quality caps everything ──
    //
    // Keyed on "is the recognition confidence below 1", NOT on "is ocrConfidence non-null".
    //
    // A first pass used non-null and was wrong: the OCR worker writes `ocrConfidence = 1.0` on
    // both non-OCR paths — pasted text and uploaded .txt files — so a non-null value does not
    // mean a scan was involved. Every field on a pasted letter was being downgraded, which also
    // produced visibly incoherent output: "Found word-for-word in the letter", tagged medium.
    //
    // Reading it as a threshold is also robust to Phase 3 item 21d, which is about making this
    // signal real. The Vision provider currently falls back to a hardcoded 0.85 when it reports
    // nothing, so the exact number is not trustworthy even when it is genuinely below 1 — hence
    // the caveat describes the situation rather than leaning on the figure.
    let caveat: string | null = null;
    const wasRecognised = typeof ocrConfidence === 'number' && ocrConfidence < 1;

    if (wasRecognised) {
        caveat = ocrConfidence! < 0.9
            ? `This was read from a scan or photo (${Math.round(ocrConfidence! * 100)}% text-recognition `
                + 'confidence), so every field is less certain than one typed in. Check anything that matters.'
            : 'This was read from a scan or photo rather than typed in, so fields are slightly less certain.';

        for (const key of Object.keys(fields)) {
            // Derived values are not downgraded: the arithmetic is unaffected by how the text
            // arrived, and its own inputs are already tagged.
            if (key === 'takeHome' || key === 'salaryComparison') continue;

            fields[key] = {
                level: downgrade(fields[key].level),
                // The reason has to move with the level. Leaving it alone produced
                // "Found word-for-word in the letter" next to a medium badge, which reads as a
                // bug to anyone looking at it — because it was one.
                reason: `${fields[key].reason} Downgraded because the text was recognised from an `
                    + 'image rather than typed, so the words themselves may be imperfect.',
            };
        }
    }

    if (!normalisedText) {
        caveat = 'The original letter is no longer stored, so extracted values could not be '
            + 'checked against it.';
    }

    // Anchored on the fields everything else is built from. A wrong company name is cosmetic; a
    // wrong role or CTC invalidates the benchmark, the score and the tax.
    const overall = worst([
        fields.role?.level ?? 'medium',
        fields.totalCTC?.level ?? 'medium',
    ]);

    return { fields, overall, caveat };
}
