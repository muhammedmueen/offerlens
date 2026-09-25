import type { AnalysisResult } from '@/modules/analysis/analysis.types.js';

/**
 * The non-AI half of the negotiation feature (plan task 21).
 *
 * ── WHY THE GATE MOVED OFF baseSalary ─────────────────────────────────────────
 * The service decided between a personalised script and a template with
 * `companyName && compensation?.baseSalary`. That was correct until task 9, which made
 * `baseSalary` nullable so that a letter quoting a single CTC figure stops reporting CTC as
 * basic. **6 of the 17 corpus letters have `baseSalary: null` in ground truth**, so roughly a
 * third of real offers silently dropped to a fill-in-the-blanks email — a measurable regression
 * introduced by an unrelated correctness fix, with nothing failing to announce it.
 *
 * `totalCTC` is the figure a candidate actually negotiates against and is present in nearly
 * every letter, so the gate now accepts either.
 *
 * ── WHY THE TEMPLATE SUBSTITUTES ──────────────────────────────────────────────
 * The old template was one hardcoded string, every field bracketed. It fired in two very
 * different situations, and in the second one — the AI provider being unreachable — we hold the
 * company, the role and the offered figure and were still printing `[COMPANY NAME]`. A template
 * that fills in what is known leaves brackets only where the user genuinely has to decide
 * something: their target number, their name, and who they are writing to.
 *
 * One function for both paths rather than two templates, because the difference between them is
 * only how much is known.
 */

export interface TemplateInput {
    tone?: string;
    companyName?: string | null;
    role?: string | null;
    totalCtc?: number | null;
    currency?: string | null;
    focusAreas?: string[];
}

/**
 * Is there enough extracted detail for a personalised script to be worth the AI call?
 *
 * Deliberately checks the amount rather than the object: `baseSalary` is
 * `{ amount, period }`, so a truthiness test passes on `{ amount: 0 }`.
 */
export function hasNegotiableDetail(
    extracted: AnalysisResult['extractedData'] | null | undefined,
): boolean {
    if (!extracted?.companyName) return false;

    const compensation = extracted.compensation;
    const ctc = compensation?.totalCTC;
    const basic = compensation?.baseSalary?.amount;

    return isUsableAmount(ctc) || isUsableAmount(basic);
}

function isUsableAmount(value: unknown): boolean {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/**
 * `₹18,00,000` for rupees, `USD 120,000` for anything else — the code rather than a guessed
 * symbol.
 *
 * The locale is per currency, not fixed. `en-IN` groups in lakhs, so formatting a dollar figure
 * with it produced `USD 1,20,000`, which is wrong for the currency it is labelled with. Caught
 * by the test below rather than by reading the code.
 */
function formatMoney(amount: number, currency?: string | null): string {
    const code = (currency || 'INR').toUpperCase();
    if (code === 'INR') return `₹${amount.toLocaleString('en-IN')}`;
    return `${code} ${amount.toLocaleString('en-US')}`;
}

const TONE_OPENERS: Record<string, string> = {
    assertive: 'I would like to discuss',
    friendly: 'I appreciate the offer and would love to discuss',
    professional: 'I am writing to respectfully discuss',
};

/**
 * One line per focus area the user ticked.
 *
 * The bracketed parts are the ones only the candidate can fill: a target figure is a decision,
 * not a fact we can extract. Unknown areas are passed through as a generic line rather than
 * dropped, so a new checkbox on the frontend cannot silently produce a shorter email.
 */
function discussionPoints(focusAreas: string[], offered: string | null): string[] {
    const points: Record<string, string> = {
        salary: offered
            ? `Base salary: [YOUR TARGET FIGURE] (current offer: ${offered})`
            : 'Base salary: [YOUR TARGET FIGURE] (current offer: [OFFERED SALARY])',
        joining_bonus: 'A one-time joining bonus, to offset [WHAT YOU ARE LEAVING BEHIND '
            + '— unvested equity, an upcoming bonus, relocation costs]',
        benefits: 'Benefits: [WHICH ONE — insurance cover, provident fund treatment, '
            + 'a learning budget]',
        equity: 'Equity: [HOW MUCH, AND THE VESTING SCHEDULE YOU WOULD LIKE]',
        pto: 'Paid leave: [NUMBER OF DAYS YOU ARE ASKING FOR]',
    };

    const chosen = focusAreas.length > 0 ? focusAreas : ['salary'];

    return chosen.map((area) => points[area]
        ?? `${area.replace(/_/g, ' ')}: [WHAT YOU WOULD LIKE CHANGED]`);
}

export function buildNegotiationTemplate(input: TemplateInput): { subject: string; body: string } {
    const company = input.companyName?.trim() || null;
    const role = input.role?.trim() || null;
    const offered = isUsableAmount(input.totalCtc)
        ? formatMoney(input.totalCtc as number, input.currency)
        : null;

    const companyText = company ?? '[COMPANY NAME]';
    const roleText = role ?? '[POSITION]';
    const opener = TONE_OPENERS[input.tone ?? 'professional'] ?? TONE_OPENERS.professional;

    const points = discussionPoints(input.focusAreas ?? [], offered)
        .map((point, i) => `${i + 1}. ${point}`)
        .join('\n');

    const subject = role
        ? `Re: ${roleText} offer${company ? ` at ${companyText}` : ''} — [YOUR NAME]`
        : 'Re: Offer Letter Discussion — [YOUR NAME]';

    const body = `Dear [HIRING MANAGER NAME],

Thank you for extending the offer for the ${roleText} role at ${companyText}. I am excited about the opportunity to contribute to your team.

${opener} the compensation package. Based on my research of market rates for this role and location, I believe there is room for adjustment.

Specifically, I would like to discuss:
${points}

I am confident in the value I would bring to ${companyText} and look forward to finding a mutually beneficial arrangement.

Best regards,
[YOUR NAME]`;

    return { subject, body };
}
