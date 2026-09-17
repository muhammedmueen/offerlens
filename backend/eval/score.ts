/**
 * Scoring for the extraction eval (Phase 0c).
 *
 * Pure and unit-tested on purpose. A scorer with a bug in it produces confident
 * numbers that are wrong in a direction nobody notices, which is worse than having
 * no measurement at all.
 *
 * Matching is deliberately tolerant. The goal is "did extraction understand the
 * letter", not "did it reproduce a string byte for byte" — "Zenthara Technologies
 * Private Limited" and "Zenthara Technologies Pvt Ltd" are the same answer.
 */

/** Company suffixes that carry no identifying information. */
const COMPANY_NOISE = [
    'private limited', 'pvt ltd', 'pvt. ltd.', 'pvt limited', 'p ltd',
    'limited', 'ltd', 'llp', 'inc', 'inc.', 'incorporated',
    'corporation', 'corp', 'company', 'co', 'gmbh', 'b.v.', 'bv', 'plc',
];

export function normaliseText(value: unknown): string {
    if (typeof value !== 'string') return '';
    return value
        .toLowerCase()
        .replace(/[.,/#!$%^&*;:{}=\-_`~()'"]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

export function normaliseCompany(value: unknown): string {
    let s = normaliseText(value);
    for (const noise of COMPANY_NOISE) {
        s = s.replace(new RegExp(`\\b${noise.replace(/[.]/g, '')}\\b`, 'g'), ' ');
    }
    return s.replace(/\s+/g, ' ').trim();
}

/**
 * Did we get the string right?
 *
 * Credits an answer when one side contains the other, so "VP, Engineering" scores
 * against "Vice President, Engineering" only if the model wrote the longer form —
 * abbreviation expansion is not rewarded, but extra qualifiers are not punished.
 */
export function textMatches(expected: string | null, actual: unknown): boolean {
    const e = normaliseText(expected);
    const a = normaliseText(actual);

    if (e === '' ) return a === '';           // Expected absent: only blank counts.
    if (a === '') return false;
    if (e === a) return true;

    return a.includes(e) || e.includes(a);
}

export function companyMatches(expected: string | null, actual: unknown): boolean {
    const e = normaliseCompany(expected);
    const a = normaliseCompany(actual);
    if (e === '') return a === '';
    if (a === '') return false;
    return e === a || a.includes(e) || e.includes(a);
}

/**
 * Numeric match within 2%.
 *
 * Tolerance exists because a letter listing components invites small, defensible
 * differences in what counts toward "total". It is NOT wide enough to forgive a
 * magnitude error — the ₹5-lakh-becomes-₹5 class of bug still fails.
 */
export function numberMatches(expected: number | null, actual: unknown, tolerance = 0.02): boolean {
    if (expected === null) return actual === null || actual === undefined;
    if (typeof actual !== 'number' || !Number.isFinite(actual)) return false;
    if (expected === 0) return actual === 0;
    return Math.abs(actual - expected) / Math.abs(expected) <= tolerance;
}

export interface SetScore {
    precision: number;
    recall: number;
    f1: number;
    matched: string[];
    missed: string[];
    spurious: string[];
}

/**
 * Overlap between two sets of loose labels.
 *
 * Reports precision and recall separately because they fail differently and the fix
 * differs: poor recall means the model missed clauses, poor precision means it
 * invented them. An F1 alone would hide which.
 */
export function scoreSet(expected: string[], actual: unknown): SetScore {
    const exp = expected.map(normaliseText).filter(Boolean);
    const act = (Array.isArray(actual) ? actual : [])
        .map((v) => normaliseText(typeof v === 'string' ? v : (v as { name?: string })?.name))
        .filter(Boolean);

    const matched: string[] = [];
    const missed: string[] = [];
    const remaining = [...act];

    for (const e of exp) {
        const hitIndex = remaining.findIndex((a) => a === e || a.includes(e) || e.includes(a));
        if (hitIndex >= 0) {
            matched.push(e);
            remaining.splice(hitIndex, 1);
        } else {
            missed.push(e);
        }
    }

    const precision = act.length === 0 ? (exp.length === 0 ? 1 : 0) : matched.length / act.length;
    const recall = exp.length === 0 ? 1 : matched.length / exp.length;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

    return { precision, recall, f1, matched, missed, spurious: remaining };
}

export type FieldName =
    | 'companyName' | 'role' | 'location' | 'totalCTC' | 'currency'
    | 'noticePeriod' | 'probationPeriod';

/** Which fields count toward the >90% "structured" target vs the >75% "nuanced" one. */
export const STRUCTURED_FIELDS: FieldName[] = ['companyName', 'role', 'totalCTC'];
export const CONTEXT_FIELDS: FieldName[] = ['location', 'currency', 'noticePeriod', 'probationPeriod'];

/**
 * Annualise a base-pay figure before comparing it to annual ground truth.
 *
 * Returns null for a missing base AND for zero: the Zod schema coerces an absent
 * baseSalary to `{ amount: 0, period: 'annual' }`, so 0 means "nothing was extracted",
 * not "this job pays nothing".
 */
export function annualiseBase(baseSalary: unknown): number | null {
    const b = baseSalary as { amount?: unknown; period?: unknown } | null | undefined;
    const amount = b?.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount) || amount === 0) return null;
    return b?.period === 'monthly' ? amount * 12 : amount;
}

/**
 * Did extraction assert base pay equal to the total on a letter that never states basic?
 *
 * Separated from "base is wrong" because the two need different fixes. A wrong number is
 * a parsing miss. base === CTC on a letter with no basic is the response schema demanding
 * a figure that is not in the text, so the model supplies the only one it has — and the
 * error then propagates into the PTO daily rate and every take-home estimate.
 */
export function assertsBaseEqualsTotal(
    expectedBase: number | null,
    expectedTotal: number | null,
    actualAnnualBase: number | null,
): boolean {
    if (expectedBase !== null) return false;      // The letter does state a basic.
    if (actualAnnualBase === null) return false;  // Nothing claimed — correct.
    return numberMatches(expectedTotal, actualAnnualBase);
}

/**
 * Number words that appear in notice and probation clauses.
 *
 * Letters write "three months"; the ground truth writes "3 months". `textMatches` scored
 * that as a miss, so probationPeriod read 64.7% and noticePeriod 76.5% when the model had
 * in fact transcribed the clause correctly — the scorer was wrong, not the extraction.
 * Exactly the failure mode this file's header warns about: confident numbers wrong in a
 * direction nobody checks.
 */
const NUMBER_WORDS: Record<string, string> = {
    one: '1', two: '2', three: '3', four: '4', five: '5', six: '6',
    seven: '7', eight: '8', nine: '9', ten: '10', eleven: '11', twelve: '12',
    fifteen: '15', eighteen: '18', twenty: '20', thirty: '30', sixty: '60', ninety: '90',
};

export function normaliseDuration(value: unknown): string {
    const mapped = normaliseText(value)
        .split(' ')
        .map((token) => NUMBER_WORDS[token] ?? token)
        .join(' ');

    // "6 (six) months" loses its parens in normaliseText and becomes "6 six months", then
    // "6 6 months" once the word maps. Collapse the repeat.
    return mapped.replace(/\b(\d+)(?:\s+\1\b)+/g, '$1').trim();
}

/**
 * Duration match for notice and probation clauses.
 *
 * Deliberately does NOT equate units: "1 month" and "30 days" stay different answers.
 * Whether a month means 30 days is a legal question the letter does not settle, and the
 * ground truth already records whichever unit the letter used.
 */
export function durationMatches(expected: string | null, actual: unknown): boolean {
    const e = normaliseDuration(expected);
    const a = normaliseDuration(actual);
    if (e === '') return a === '';
    if (a === '') return false;
    return e === a || a.includes(e) || e.includes(a);
}
