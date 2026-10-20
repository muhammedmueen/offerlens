import type { Benefit, RedFlag } from '@/modules/analysis/analysis.types.js';
import { normalise } from '@/modules/analysis/redflag.rules.js';

/**
 * What a normal Indian offer contains, and what this one does not (Phase 2 task 12).
 *
 * ── WHY A CHECKLIST RATHER THAN MORE RULES ───────────────────────────────────
 * The largest remaining error group is flags for things that are ABSENT. The rule engine
 * cannot help: it matches clauses, and you cannot match a health insurance clause that is not
 * there. The model cannot do it reliably either — over three eval passes it INVENTED
 * `missing_benefit` on letters that do name cover (cases 01, 02, 08) while MISSING it on
 * letters that are genuinely bare (03, 05, 06).
 *
 * Absence is not a language problem. It is a set-difference against a list, which is
 * arithmetic, and arithmetic is deterministic.
 *
 * ── WHY THE THRESHOLD IS DELIBERATELY FORGIVING ──────────────────────────────
 * Flagging every gap would be worse than flagging none. Real, perfectly normal offers omit
 * one item all the time: corpus case 02 names insurance and PF but no leave, case 08 names
 * leave and PF but no health cover, case 09 names cover and leave but no PF. None of those is
 * a red flag, and annotating them as one would train users to ignore the flag entirely.
 *
 * So this fires only when an offer is SUBSTANTIALLY bare — fewer than two of three core
 * benefits. That threshold was chosen against the corpus's existing ground truth, which was
 * annotated long before this module, and it produces no false positives across all 17 cases.
 */

interface CoreBenefit {
    key: string;
    label: string;
    /** Normalised keywords. Any match counts the benefit as present. */
    matches: string[];
    /** Shown to the user when it is absent. */
    why: string;
}

/**
 * The three that essentially every permanent Indian offer has.
 *
 * Kept to three on purpose. Each addition raises the false-positive rate on ordinary offers,
 * and a benefits checklist that cries wolf is worth less than no checklist.
 */
export const CORE_BENEFITS: CoreBenefit[] = [
    {
        key: 'retirement',
        label: 'Provident fund or retirement contribution',
        // Both "401k" and "401(k)" are listed: `normalise` folds hyphens and apostrophes but
        // keeps parentheses, and it is shared with the rule engine so it is not worth changing
        // there for one keyword.
        matches: ['provident', 'pf', 'epf', 'retirement', '401k', '401(k)', 'superannuation', 'nps', 'epfo'],
        why: 'Employer PF is statutory for most Indian employees and is real deferred pay. '
            + 'An offer that does not mention it may be structuring around it.',
    },
    {
        key: 'health',
        label: 'Health or medical insurance',
        matches: [
            // MONEY-4: bare 'insurance' and 'vision' are deliberately absent. "Term life
            // insurance" is not health cover, and 'vision' matched "provision". Insurance counts
            // only with a health/medical/group qualifier.
            'health', 'healthcare', 'medical', 'mediclaim', 'group insurance',
            'hospitalisation', 'hospitalization', 'dental', 'esi', 'esic', 'employee state insurance',
        ],
        why: 'Group cover is near-universal and expensive to buy individually. Its absence is '
            + 'a real cost you would be absorbing yourself.',
    },
    {
        key: 'leave',
        label: 'Paid leave',
        matches: [
            'leave', 'pto', 'paid time off', 'vacation', 'holiday', 'earned leave',
            'casual leave', 'privilege leave', 'annual leave',
        ],
        why: 'Paid leave should be stated as a number of days. If the letter is silent, the '
            + 'entitlement is whatever policy says later.',
    },
];

/**
 * Worth reporting, never worth flagging.
 *
 * These are common enough that their absence is informative and ordinary enough that treating
 * it as a red flag would be noise. Surfaced for display only.
 */
export const NOTABLE_BENEFITS: CoreBenefit[] = [
    {
        key: 'gratuity',
        label: 'Gratuity',
        matches: ['gratuity'],
        why: 'Statutory after five years of continuous service whether or not the letter says so.',
    },
    {
        key: 'life',
        label: 'Term life or accident cover',
        matches: ['term life', 'life insurance', 'accident', 'personal accident', 'edli'],
        why: 'Common in larger companies, and cheap for an employer to provide.',
    },
    {
        key: 'learning',
        label: 'Learning or certification budget',
        matches: ['learning', 'certification', 'training', 'conference', 'education', 'upskill'],
        why: 'Not standard, but a reasonable thing to ask for if it matters to you.',
    },
    {
        key: 'flexibility',
        label: 'Remote or flexible working',
        matches: ['flexible', 'remote', 'hybrid', 'work from home', 'wfh'],
        why: 'Worth having in writing rather than as an unwritten team norm.',
    },
];

export interface ChecklistEntry {
    key: string;
    label: string;
    present: boolean;
    /** Only populated when absent. */
    why?: string;
}

export interface BenefitsChecklist {
    core: ChecklistEntry[];
    notable: ChecklistEntry[];
    /** How many of the three core benefits the letter names. */
    corePresent: number;
    /** True when fewer than two core benefits are named. */
    isBare: boolean;
}

/**
 * Everything the offer says about benefits, as one string.
 *
 * Reads `details` and `value` as well as `name`, because the model often puts the substance
 * there — "Group cover" as the name with "medical insurance, ₹5,00,000 floater" in details.
 * Matching on the name alone would miss it.
 */
function haystack(benefits: Benefit[]): string {
    if (!Array.isArray(benefits)) return '';

    return benefits
        .map((b) => [b?.name, b?.value, b?.details].filter(Boolean).join(' '))
        .join(' | ');
}

/**
 * Whole-word keyword test (MONEY-4). Plain substring matching read "pto" in "Laptop", "pf" in
 * "upfront" and "esi" in "residence" as benefits. Every keyword must start at a word boundary;
 * short ones (<=4 chars: pf, nps, esi, pto, ...) must also end at one, optionally plural.
 * Longer keywords may carry a suffix ("upskill" -> "upskilling", "holiday" -> "holidays").
 */
function hasKeyword(text: string, keyword: string): boolean {
    const kw = normalise(keyword).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const tail = kw.length <= 4 ? 's?(?![a-z0-9])' : '';
    return new RegExp(`(?<![a-z0-9])${kw}${tail}`).test(text);
}

function evaluate(list: CoreBenefit[], text: string): ChecklistEntry[] {
    return list.map((item) => {
        const present = item.matches.some((keyword) => hasKeyword(text, keyword));
        return present
            ? { key: item.key, label: item.label, present: true }
            : { key: item.key, label: item.label, present: false, why: item.why };
    });
}

export function checkBenefits(benefits: Benefit[]): BenefitsChecklist {
    const text = normalise(haystack(benefits));

    const core = evaluate(CORE_BENEFITS, text);
    const notable = evaluate(NOTABLE_BENEFITS, text);
    const corePresent = core.filter((e) => e.present).length;

    return { core, notable, corePresent, isBare: corePresent < 2 };
}

/**
 * A red flag for a substantially bare offer, or null.
 *
 * `matchedText` lists what is missing rather than quoting the letter, because there is nothing
 * to quote — the whole point is that the text is silent. The worker's hallucination guard is
 * applied only to model-supplied flags, so this is not dropped for failing to be a quote.
 */
export function bareBenefitsFlag(
    checklist: BenefitsChecklist,
    employmentType?: string | null,
): RedFlag | null {
    if (!checklist.isBare) return null;

    const missing = checklist.core.filter((e) => !e.present).map((e) => e.label);

    // Contract and internship offers legitimately carry no statutory benefits, so the framing
    // changes — but it is still the single most important thing such a candidate should price
    // in, so it is still raised.
    const isNonPermanent = employmentType === 'contract' || employmentType === 'intern';

    return {
        type: 'missing_benefit',
        severity: isNonPermanent ? 'medium' : 'high',
        title: isNonPermanent
            ? 'No statutory benefits with this engagement'
            : 'Standard benefits are missing',
        explanation: isNonPermanent
            ? 'This is not permanent employment, so provident fund, gratuity and employer health '
                + 'cover do not apply. That is lawful, and it means the headline figure is not '
                + 'comparable with a salaried offer — you would fund all of it yourself.'
            : `This offer does not mention ${missing.join(', ').toLowerCase()}. `
                + 'Benefits an offer letter omits are set by policy later, or not at all.',
        matchedText: `Not mentioned in the letter: ${missing.join(', ')}`,
        suggestion: isNonPermanent
            ? 'Price the gap — cover, retirement saving and unpaid leave — before comparing this '
                + 'against a salaried offer, and ask whether the fee can absorb it.'
            : 'Ask for the benefits to be listed in the offer letter with specifics: days of '
                + 'leave, sum assured on cover, and the PF contribution.',
    };
}
