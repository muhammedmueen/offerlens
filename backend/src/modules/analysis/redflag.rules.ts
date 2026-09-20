import type { RedFlag } from './analysis.types.js';

/**
 * Deterministic red-flag detection (Phase 2 task 8).
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * After Phase 1, red-flag F1 sat at 71-77% and **moved between runs on identical
 * input** — 76.7% then 71.2% on two consecutive eval runs. A clause either restricts
 * the candidate or it does not; that should not be a coin flip. Clause detection is
 * pattern matching, and pattern matching is what code is for.
 *
 * This runs ALONGSIDE the model, not instead of it. The model still catches phrasings
 * nobody anticipated; these rules guarantee the well-known clauses are never missed.
 *
 * ── THE HARD PART IS NEGATION, NOT MATCHING ──────────────────────────────────
 * `eval/corpus.ts` case `17-deliberately-clean` is a real letter that says:
 *
 *     "The Company does not impose any post-employment non-compete restriction."
 *     "The joining bonus of ₹1,00,000 is not subject to a repayment or clawback
 *      obligation."
 *
 * A rule that greps for "non-compete" and "clawback" flags both — turning a genuinely
 * candidate-friendly letter into a scary one. That is worse than missing a flag: it
 * destroys trust in every flag we do raise. So every rule carries `absent` cues that
 * disarm it, and the corpus case that proves it is a permanent regression test.
 *
 * The inverse trap is just as real. Case `05-red-flag-heavy` writes a genuine
 * non-compete as *"You **shall not** ... engage in ... any business competing"*. So
 * "shall not" can NEVER be treated as a negation cue — in legal prose it usually
 * introduces the candidate's obligation. Negation cues have to name what is being
 * negated ("does not impose", "not subject to a repayment"), which is why they are
 * per-rule rather than one shared list.
 *
 * ── MATCHING STRATEGY ────────────────────────────────────────────────────────
 * `String.includes` over normalised sentences, no regex in the rules themselves. Two
 * reasons: the input is attacker-supplied text, and a backtracking regex on a 100k-char
 * paste is a denial-of-service primitive; and `includes` on a normalised string is
 * simply easier to reason about when a rule misfires.
 *
 * The sentence is the evaluation unit because it is the natural scope for negation — a
 * disclaimer sits with the clause it disclaims.
 *
 * ponytail: no wall-clock timeout, unlike the "100ms timeout" the plan sketched. This
 * is linear in (sentences × phrases) with no backtracking, and the accompanying test
 * asserts a 100k-char letter completes well inside that budget. A timer that provably
 * cannot fire is dead code that still has to be maintained. The bound that DOES matter
 * is input length, and that is already enforced upstream by MAX_EXTRACT_TEXT_CHARS.
 */

/** Abbreviations whose full stop must not be read as a sentence boundary. */
const ABBREVIATIONS = [
    'rs.', 'no.', 'nos.', 'inc.', 'ltd.', 'pvt.', 'llp.', 'co.',
    'mr.', 'ms.', 'mrs.', 'dr.', 'prof.', 'e.g.', 'i.e.', 'etc.', 'viz.',
];

const DOT_PLACEHOLDER = '\u0000';

/** A numbered clause, bullet, or lettered sub-clause — a real boundary, not a wrapped line. */
const BLOCK_START = /^(?:\d+[.)]|[-*\u2022\u00b7]|\([a-z0-9]+\)|[a-z][.)])\s/i;

/**
 * Join lines that are wrapped mid-sentence.
 *
 * This is load-bearing, and getting it wrong is what a first pass got wrong. Splitting on
 * every newline treats a hard wrap as a sentence boundary, so this letter:
 *
 *     ... obligations. The Company does not impose any
 *     post-employment non-compete restriction.
 *
 * put the negation cue "does not impose" in a different fragment from the trigger
 * "non-compete" — and the rule fired on a clause that explicitly disclaims the
 * restriction. Exactly the false positive the whole design is meant to prevent.
 *
 * Not a fixture quirk: PDF text extraction wraps at the visual line, so every scanned or
 * exported offer letter arrives like this.
 *
 * A newline is treated as a real break only when the previous line ended on sentence
 * punctuation, the next line opens a numbered or bulleted block, or the line is blank.
 * Everything else is a wrap and gets joined with a space.
 */
export function unwrapLines(text: string): string {
    const lines = text.replace(/\r\n?/g, '\n').split('\n');
    const out: string[] = [];

    for (const raw of lines) {
        const line = raw.trim();
        if (line === '') {
            out.push('');   // Blank line: a paragraph break, always a boundary.
            continue;
        }

        const previous = out.length > 0 ? out[out.length - 1] : '';
        const previousIsOpen = previous !== '' && !/[.;:!?]$/.test(previous);

        if (previousIsOpen && !BLOCK_START.test(line)) {
            out[out.length - 1] = `${previous} ${line}`;
        } else {
            out.push(line);
        }
    }

    return out.join('\n');
}

/**
 * Split into sentences, keeping the original text of each.
 *
 * Abbreviations are masked before anything else. Without that, "a sum of Rs. 2,00,000
 * towards recovery of training costs" splits mid-clause and the quote we show the user is
 * a fragment ending in "a sum of Rs." — which also loses the words the rule matched on.
 * Masking first also stops `unwrapLines` reading that same full stop as a line that closed.
 */
export function splitSentences(text: string): string[] {
    let masked = text;
    for (const abbr of ABBREVIATIONS) {
        const withoutDot = abbr.slice(0, -1) + DOT_PLACEHOLDER;
        masked = masked.split(abbr).join(withoutDot);

        const capitalised = abbr.charAt(0).toUpperCase() + abbr.slice(1);
        masked = masked.split(capitalised).join(capitalised.slice(0, -1) + DOT_PLACEHOLDER);
    }

    return unwrapLines(masked)
        .split(/[.;!?]+\s+|\n+/)
        .map((s) => s.split(DOT_PLACEHOLDER).join('.').trim())
        .filter((s) => s.length > 0);
}

/**
 * Fold away everything that varies between letters saying the same thing.
 *
 * Hyphens in particular: "non-compete", "non compete" and "non–compete" (en dash, which
 * Word inserts automatically) must all match one rule phrase. Apostrophes go too, so
 * "15 days' written notice" matches "15 days written notice".
 */
export function normalise(text: string): string {
    return text
        .toLowerCase()
        .replace(/[\u2018\u2019'`]/g, '')
        .replace(/[-\u2010-\u2015_/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

interface RuleDefinition {
    id: string;
    type: RedFlag['type'];
    severity: RedFlag['severity'];
    title: string;
    explanation: string;
    suggestion: string;
    /** Any one of these in a sentence arms the rule. Normalised form. */
    triggers: string[];
    /** Any one of these in the SAME sentence disarms it. */
    absent?: string[];
    /** The sentence must also contain one of these. Used to keep a rule on topic. */
    requiresAny?: string[];
    /** Any one of these ANYWHERE in the letter disarms the rule. */
    absentInDocument?: string[];
}

/** Words that mark a sentence as being about pay rather than about something else. */
const COMPENSATION_CONTEXT = [
    'salary', 'ctc', 'compensation', 'remuneration', 'bonus', 'incentive', 'pay',
    'equity', 'esop', 'rsu', 'stock', 'stipend', 'allowance', 'fee', 'increment',
    'variable', 'commission',
];

export const RULES: RuleDefinition[] = [
    {
        id: 'non-compete',
        type: 'non_compete',
        severity: 'high',
        title: 'Post-employment non-compete',
        explanation:
            'This restricts where you can work after leaving. Indian courts generally will '
            + 'not enforce a post-employment non-compete under section 27 of the Contract Act, '
            + 'but the clause can still be used to threaten you or to hold up a relieving letter.',
        suggestion:
            'Ask for it to be removed, or narrowed to a named list of direct competitors and '
            + 'a period of no more than six months.',
        triggers: [
            'non compete',
            'competing with the company',
            'business competing',
            'engage in any competing',
            'shall not solicit',
            'restraint of trade',
            'not accept work from any client',
        ],
        // Case 17 disclaims the restriction using the same words that name it.
        absent: [
            'does not impose',
            'no post employment non compete',
            'no non compete',
            'not subject to any non compete',
            'non compete shall not apply',
        ],
    },

    {
        id: 'service-bond',
        type: 'bond',
        severity: 'high',
        title: 'Minimum service commitment',
        explanation:
            'You are committing to stay for a fixed period. Leaving early typically triggers a '
            + 'payment, and the amount is often far larger than the training it claims to cover.',
        suggestion:
            'Ask for the bond to be dropped, or for the recovery amount to be reduced and '
            + 'pro-rated against time already served.',
        triggers: [
            'minimum period of',
            'minimum service period',
            'serve the company for a minimum',
            'service bond',
            'employment bond',
            'minimum service commitment',
        ],
        absent: [
            'no minimum service',
            'no bond',
            'without any bond',
        ],
    },

    {
        id: 'clawback',
        type: 'clawback',
        severity: 'high',
        title: 'Repayment or clawback obligation',
        explanation:
            'Money already paid to you can be reclaimed if you leave within a stated period. '
            + 'That converts a signing incentive into a debt.',
        suggestion:
            'Ask for the clawback to be pro-rated over the period, or removed in the case of '
            + 'redundancy or termination without cause.',
        triggers: [
            'clawback',
            'claw back',
            'recoverable',
            'reimburse the company',
            'liable to reimburse',
            'recovery of training',
            'repay the joining bonus',
            'refund the',
        ],
        // The exact wording of case 17 clause 4, which a keyword-only rule would flag.
        absent: [
            'not subject to a repayment',
            'not subject to repayment',
            'not subject to any repayment',
            'no clawback',
            'not recoverable',
            'not be recoverable',
            'without any clawback',
            'not subject to any clawback',
            'is not subject to a repayment or clawback',
        ],
    },

    {
        id: 'ip-overbreadth',
        type: 'ip_assignment',
        severity: 'medium',
        title: 'Overbroad intellectual property assignment',
        explanation:
            'This claims work created outside your job and outside working hours, not just what '
            + 'you build for the company. As written it could cover a personal side project.',
        suggestion:
            'Ask for it to be limited to work created using company resources within the scope '
            + 'of your duties, with a written carve-out for pre-existing and personal projects.',
        /**
         * Deliberately does NOT trigger on "intellectual property" alone.
         *
         * A narrow IP clause is normal and not a red flag. Case 17 has one:
         * "Intellectual property created specifically in the course of your assigned duties
         * using Company resources shall belong to the Company" — that is standard, and
         * flagging it would be a false alarm. What distinguishes case 05 is BREADTH, so the
         * triggers are overbreadth markers rather than the topic itself.
         */
        triggers: [
            'whether or not during working hours',
            'vest absolutely',
            'all intellectual property',
            'any and all intellectual property',
            'any and all inventions',
            'all inventions',
            'outside the scope of your employment',
            'whether or not related to',
            'all work product',
            'assigned to the company upon creation',
            'is assigned to',
        ],
        /**
         * Document-level, not sentence-level, and that is the point: IP carve-outs are
         * conventionally written as the sentence AFTER the assignment. Case 17 splits them
         * exactly that way. A sentence-scoped check would miss the carve-out and flag a
         * letter that explicitly protects the candidate's own work.
         */
        absentInDocument: [
            'pre existing intellectual property',
            'shall remain yours',
            'personal projects created without company resources',
            'independently developed work',
            'excluding your pre existing',
        ],
    },

    {
        id: 'probation-no-notice',
        type: 'probation',
        severity: 'high',
        title: 'Termination during probation without notice',
        explanation:
            'During probation you can be let go with no notice period and no reason given, '
            + 'which leaves you with no income and no time to find another role.',
        suggestion:
            'Ask for a minimum notice period during probation — even 15 days — and for the '
            + 'reason to be stated in writing.',
        /**
         * Triggers on the absence of notice, not on the word "probation". Case 17 has a
         * three-month probation WITH 15 days written notice on both sides, which is fine.
         * Probation itself is not a red flag; probation with no protection is.
         */
        triggers: [
            'terminated without notice',
            'without notice and without assigning any reason',
            'without assigning any reason',
            'terminate your services without notice',
            'services may be terminated without',
            'terminated at any time without notice',
        ],
        absent: [
            'by providing 15 days',
            'by providing 30 days',
            'with 15 days written notice',
            'with 30 days written notice',
        ],
    },

    {
        id: 'benefits-explicitly-denied',
        type: 'missing_benefit',
        severity: 'medium',
        title: 'Statutory benefits explicitly excluded',
        explanation:
            'The letter states outright that standard benefits do not apply. For an Indian '
            + 'employee that usually means no provident fund, no gratuity accrual and no '
            + 'employer health cover — costs that shift onto you and are not reflected in the '
            + 'headline figure.',
        suggestion:
            'Price the gap before comparing this against a salaried offer, and ask whether the '
            + 'fee can be raised to cover it.',
        /**
         * Only fires on an EXPLICIT denial. Detecting a benefit that is merely absent is an
         * absence judgement over the whole letter, not a phrase match — that belongs with
         * the standard-benefits checklist in task 12, which can compare against a list.
         */
        triggers: [
            'no statutory benefits',
            'no statutory benefit',
            'no paid leave',
            'no benefits are applicable',
            'no medical cover',
            'no provident fund shall accrue',
            'responsible for your own taxes',
            'shall accrue for the duration of this engagement',
        ],
    },

    {
        id: 'discretionary-pay',
        type: 'vague_compensation',
        severity: 'medium',
        title: 'Pay left to the employer’s discretion',
        explanation:
            'Part of what you are being offered is not committed. It depends on a judgement the '
            + 'employer makes later, on terms they control, so the headline number may not be '
            + 'what you receive.',
        suggestion:
            'Ask for the criteria in writing, or for a guaranteed minimum on the variable '
            + 'portion for the first year.',
        triggers: [
            'sole discretion',
            'as determined by management',
            'at the discretion of management',
            'subject to board approval',
            'earning potential',
            'assessed solely by the company',
            'entirely dependent on',
            'may be revised at the discretion',
        ],
        /**
         * Must also be a sentence about money. "The Company reserves the right to terminate
         * immediately ... at its sole discretion" is a termination clause, not vague pay, and
         * counting it as `vague_compensation` would be scoring a hit for the wrong reason —
         * which flatters the eval number while telling the user something false.
         */
        requiresAny: COMPENSATION_CONTEXT,
    },
];

export interface RuleMatch extends RedFlag {
    /** Which rule fired, for debugging a false positive without re-deriving it. */
    ruleId: string;
}

/** Longest quote we put in front of a user. Long enough to be checkable, short enough to read. */
const MAX_QUOTE_CHARS = 300;

/**
 * Run every rule over a letter.
 *
 * At most one match per rule: three sentences restricting competition is still one
 * non-compete problem, and repeating it three times in the UI reads as noise. The first
 * match wins, so the quote is the earliest occurrence.
 */
export function detectRedFlags(text: string): RuleMatch[] {
    if (typeof text !== 'string' || text.trim() === '') return [];

    const sentences = splitSentences(text);
    const normalisedSentences = sentences.map(normalise);
    const normalisedDocument = normalise(text);

    const matches: RuleMatch[] = [];

    for (const rule of RULES) {
        if (rule.absentInDocument?.some((cue) => normalisedDocument.includes(cue))) continue;

        for (let i = 0; i < sentences.length; i++) {
            const sentence = normalisedSentences[i];

            if (!rule.triggers.some((phrase) => sentence.includes(phrase))) continue;
            if (rule.absent?.some((cue) => sentence.includes(cue))) continue;
            if (rule.requiresAny && !rule.requiresAny.some((word) => sentence.includes(word))) continue;

            matches.push({
                ruleId: rule.id,
                type: rule.type,
                severity: rule.severity,
                title: rule.title,
                explanation: rule.explanation,
                // Verbatim from the source, so this passes the worker's hallucination guard
                // by construction rather than by luck.
                matchedText: sentences[i].slice(0, MAX_QUOTE_CHARS),
                suggestion: rule.suggestion,
            });
            break;
        }
    }

    return matches;
}

/**
 * Combine deterministic matches with the model's, preferring the deterministic one.
 *
 * Deduplicated by `type`. If the rules found a non-compete and so did the model, the user
 * sees one — and it is the rule's, because its quote is verbatim by construction and its
 * explanation does not vary between runs.
 *
 * Union rather than replacement: the model catches phrasings these rules do not know, and
 * dropping it would trade measured recall for tidiness.
 */
export interface MergeOptions {
    /**
     * Flag types the model is not trusted with at all, dropped whether or not a deterministic
     * check produced one.
     *
     * Needed because "we checked and there is no problem" is a positive verdict, not silence.
     * `missing_benefit` is the case: the benefits checklist decides it by set difference against
     * a list, and over three eval passes the model INVENTED that flag on letters that do name
     * cover while MISSING it on letters that are genuinely bare. Without suppression, the
     * checklist could only ever add flags, never correct a wrong one.
     */
    suppress?: Array<RedFlag['type']>;
}

export function mergeRedFlags(
    ruleMatches: RuleMatch[],
    aiFlags: RedFlag[],
    options: MergeOptions = {},
): RedFlag[] {
    const suppressed = new Set(options.suppress ?? []);
    const seen = new Set(ruleMatches.map((m) => m.type));

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stripped: RedFlag[] = ruleMatches.map(({ ruleId, ...flag }) => flag);

    for (const flag of Array.isArray(aiFlags) ? aiFlags : []) {
        if (!flag || seen.has(flag.type) || suppressed.has(flag.type)) continue;
        seen.add(flag.type);
        stripped.push(flag);
    }

    return stripped;
}
