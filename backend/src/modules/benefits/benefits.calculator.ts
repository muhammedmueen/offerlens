import { Benefit, Compensation } from '@/modules/analysis/analysis.types.js';

export interface BenefitBreakdown {
    name: string;
    category: 'pto' | 'insurance' | 'equity' | 'retirement' | 'other';
    monetaryValue: number | null;
    details: string;
    isQuantifiable: boolean;
}

const WORKING_DAYS_PER_YEAR = 260;

export function calculateBenefitValues(
    benefits: Benefit[],
    compensation: Compensation | null,
    overrides?: Record<string, number>
): BenefitBreakdown[] {
    // `baseSalary` and its `amount` are both nullable now: most letters quote only a CTC and
    // never state basic. A zero daily rate is the signal the PTO branch already keys off to
    // mark leave unquantifiable rather than valuing it wrongly.
    const basic = compensation?.baseSalary;
    const dailyRate = basic?.amount
        ? basic.amount / (basic.period === 'monthly' ? 22 : WORKING_DAYS_PER_YEAR)
        : 0;

    const currency = compensation?.currency || 'INR';
    const overridden = new Set<number>();

    const rows = benefits.map((benefit, index): BenefitBreakdown => {
        // Defensive: this is fed AI-derived data. A non-string name threw a 500 here.
        const name = String(benefit?.name ?? '').toLowerCase();
        const category = categorize(name);
        // BEN-5: a `#<row index>` key targets one row, so two benefits sharing a name can carry
        // different overrides. The plain-name key still works for older clients.
        const overrideValue = overrides?.[`#${index}`] ?? overrides?.[benefit.name];

        if (overrideValue !== undefined) {
            overridden.add(index);
            return {
                name: benefit.name,
                category,
                monetaryValue: overrideValue,
                details: `User-provided value: ${overrideValue.toLocaleString('en-IN')}`,
                isQuantifiable: true,
            };
        }

        // PTO / Leave
        if (category === 'pto') {
            const days = extractCount(benefit.value || benefit.details || '');

            if (days && dailyRate) {
                return {
                    name: benefit.name,
                    category: 'pto',
                    monetaryValue: Math.round(days * dailyRate),
                    details: `${days} days × ₹${Math.round(dailyRate)}/day`,
                    isQuantifiable: true,
                };
            }

            // Return here rather than falling through. Previously, when base salary was
            // unknown (dailyRate 0) this dropped to the generic branch below, which read
            // the day count as a rupee amount — "18 days of paid leave" became ₹18 and
            // was summed into totalCompensation.
            return {
                name: benefit.name,
                category: 'pto',
                monetaryValue: null,
                details: days
                    ? `${days} days — not valued, base salary unknown`
                    : 'Leave mentioned but the number of days could not be read',
                isQuantifiable: false,
            };
        }

        // Insurance / Health
        if (category === 'insurance') {
            const amount = extractMoney(benefit.value || benefit.details || '', currency);
            if (amount) {
                // BEN-2 (Model A): an insurance figure is a COVER / sum assured — coverage,
                // not pay — so it is NON-quantifiable and must never be summed into
                // benefitsValue or the headline. Show the amount as descriptive cover detail.
                //
                // ponytail: the Benefit schema (name/value/details/isStandard) cannot tell an
                // employer-paid PREMIUM (a real CTC cost) from a sum-assured COVER, so every
                // insurance figure is treated as cover (the safe Model A default). Upgrade
                // path: add a schema field marking premium vs cover, after which a genuine
                // premium may become a monetaryValue as an employer cost that is part of CTC.
                return {
                    name: benefit.name,
                    category: 'insurance',
                    monetaryValue: null,
                    details: `Cover: ₹${amount.toLocaleString('en-IN')}`,
                    isQuantifiable: false,
                };
            }
            // No amount found: coverage mentioned but not quantifiable.
            return {
                name: benefit.name,
                category: 'insurance',
                monetaryValue: null,
                details: 'Coverage mentioned but value not quantifiable from offer text',
                isQuantifiable: false,
            };
        }

        // Equity / RSU / ESOP
        if (category === 'equity') {
            const amount = extractMoney(benefit.value || benefit.details || '', currency);
            if (amount) {
                return {
                    name: benefit.name,
                    category: 'equity',
                    monetaryValue: amount,
                    details: `Equity value: ${amount.toLocaleString('en-IN')}`,
                    isQuantifiable: true,
                };
            }
            return {
                name: benefit.name,
                category: 'equity',
                monetaryValue: null,
                details: 'Mentioned but not quantifiable — missing vesting schedule or strike price',
                isQuantifiable: false,
            };
        }

        // Retirement / PF / 401k
        if (category === 'retirement') {
            const amount = extractMoney(benefit.value || benefit.details || '', currency);
            if (amount) {
                return {
                    name: benefit.name,
                    category: 'retirement',
                    monetaryValue: amount,
                    details: `Annual contribution: ${amount.toLocaleString('en-IN')}`,
                    isQuantifiable: true,
                };
            }

            // Return here, like the pto/insurance/equity branches do. This used to fall
            // through to the generic fallback, which relabelled the row `other` — so the
            // most common Indian benefit of all, "Provident Fund" stated with no amount,
            // was displayed under the wrong category on every offer.
            //
            // ponytail: still not valued. PF is statutory (12% of basic), so it IS
            // computable — but only from basic pay, and letters that quote a single CTC
            // figure do not state basic. Guessing a basic-to-CTC ratio here would put a
            // fabricated number into totalCompensation. The deterministic Indian salary
            // breakdown in Phase 2 is where this gets a real value.
            return {
                name: benefit.name,
                category: 'retirement',
                monetaryValue: null,
                details: benefit.details || 'Statutory contribution — value depends on basic pay, which the offer does not state',
                isQuantifiable: false,
            };
        }

        // Generic fallback
        const amount = extractMoney(benefit.value || benefit.details || '', currency);
        return {
            name: benefit.name,
            category: 'other',
            monetaryValue: amount || null,
            details: benefit.details || benefit.value || 'No monetary value extractable',
            isQuantifiable: amount !== null,
        };
    });

    return capAtCtc(rows, overridden, compensation?.totalCTC ?? null);
}

/**
 * Model A guard: benefits are a breakdown OF the CTC, so extracted amounts can never sum to
 * more than it. When they do, some figure was misread — drop the largest extracted values
 * (most likely the misparse) to "not valued" until the sum fits. User overrides are never
 * touched; a user who types a bigger number meant it.
 *
 * ponytail: largest-first is a heuristic. It cannot know WHICH row is wrong, only that the
 * set is impossible. Upgrade path: per-row confidence from the extractor.
 */
function capAtCtc(rows: BenefitBreakdown[], overridden: Set<number>, totalCTC: number | null): BenefitBreakdown[] {
    if (!totalCTC || totalCTC <= 0) return rows;

    // Overrides use up part of the CTC first. If they alone fill it, that is the user's call and
    // says nothing about the extracted rows, so leave those alone rather than blame the offer.
    // ponytail: overrides may therefore push benefitsValue past the CTC — accepted, the user typed it.
    const overrideSum = rows.reduce((s, r, i) => s + (overridden.has(i) ? r.monetaryValue || 0 : 0), 0);
    const budget = totalCTC - overrideSum;
    if (budget <= 0) return rows;

    let sum = rows.reduce((s, r, i) => s + (overridden.has(i) ? 0 : r.monetaryValue || 0), 0);
    const byValueDesc = rows
        .map((_, i) => i)
        .filter((i) => !overridden.has(i) && rows[i].monetaryValue)
        .sort((a, b) => rows[b].monetaryValue! - rows[a].monetaryValue!);

    const out = [...rows];
    for (const i of byValueDesc) {
        if (sum <= budget) break;
        sum -= out[i].monetaryValue!;
        out[i] = {
            ...out[i],
            monetaryValue: null,
            isQuantifiable: false,
            details: `Not valued — the amount read from the offer (${rows[i].monetaryValue!.toLocaleString('en-IN')}) `
                + `does not fit within the total CTC of ${totalCTC.toLocaleString('en-IN')}`
                + `${overrideSum ? ' after your own values' : ''}. Enter a value to include it.`,
        };
    }
    return out;
}

/**
 * Whole-word category matching (BEN-5). Substring matching put "Laptop" under leave ("pto"),
 * "Health club" under insurance and "Stockholm relocation" under equity.
 */
const CATEGORY_PATTERNS: Array<[BenefitBreakdown['category'], RegExp]> = [
    ['pto', /\b(?:pto|leaves?|vacations?|holidays?)\b/],
    // "health" alone is insurance, but not when it is a club/gym/fitness perk.
    ['insurance', /\b(?:insurance|medical|mediclaim|health(?!\s+(?:club|gym|fitness|wellness|membership)))\b/],
    ['equity', /\b(?:equity|rsus?|esops?|stocks?)\b/],
    ['retirement', /\b(?:provident|pf|epf|retirement|401\(?k\)?)(?![a-z0-9])/],
];

function categorize(name: string): BenefitBreakdown['category'] {
    return CATEGORY_PATTERNS.find(([, re]) => re.test(name))?.[0] ?? 'other';
}

/** Indian magnitude words/suffixes -> multiplier. Keys are lower-case. */
const MAGNITUDE: Record<string, number> = {
    crore: 10_000_000, crores: 10_000_000, cr: 10_000_000,
    lakh: 100_000, lakhs: 100_000, lac: 100_000, lacs: 100_000, lpa: 100_000, l: 100_000,
    thousand: 1_000, k: 1_000,
};

const CURRENCY_MARKERS: Record<string, string> = {
    '\u20B9': 'INR', rs: 'INR', 'rs.': 'INR', inr: 'INR',
    $: 'USD', usd: 'USD', '\u20AC': 'EUR', eur: 'EUR', '\u00A3': 'GBP', gbp: 'GBP',
};

/**
 * One number, optionally led by a currency marker and trailed by a magnitude word. The
 * magnitude is part of the token, so "k"/"lakh" binds only to the number directly beside it.
 * `(?![a-z\d])` stops "25kg" or "5 lakhx" from half-matching.
 */
const MONEY_TOKEN =
    /(\u20B9|\brs\.?|\binr\b|[$\u20AC\u00A3]|\busd\b|\beur\b|\bgbp\b)?\s*(\d+(?:\.\d+)?)\s*(crores?|cr|lakhs?|lacs?|lpa|thousand|l|k)?(?![a-z\d])/gi;

/** What a bare number is counting, or a rate — not rupees. */
const NON_MONEY_AFTER =
    /^\s*(?:%|percent\b|per\s*cent\b|(?:rsus?|options?|shares?|units?|stocks?|esops?|days?|weeks?|months?|years?|yrs?|hours?|hrs?)\b)/i;

const PER_MONTH = /\b(?:per\s+month|monthly|pm|p\.m\.?)(?![a-z])|\/\s*(?:month|mo)\b/i;

/**
 * Extract an annual monetary amount from free text, honouring Indian magnitude words.
 *
 * MONEY-3: this used to take the FIRST number and apply the first magnitude pattern found
 * ANYWHERE in the string, so "2,000 RSUs worth $40k" became 20,00,000 rupees and "12% of basic"
 * became 12 rupees. Now each candidate number carries its own magnitude and currency marker;
 * percentages and counts of RSUs/options/days/etc. are skipped; and an amount marked in the
 * offer's own currency (default INR) beats a bare number. A figure in a DIFFERENT currency is
 * never used — null, not a guessed FX rate. "per month"/"monthly"/"pm" multiplies by 12.
 *
 * ponytail: no FX conversion, no trailing codes ("5 USD"), and "pm" is read as per-month even
 * for a time of day. The per-month marker is tested against the WHOLE string, so a field mixing
 * a monthly and an annual figure ("Rs 2000 per month plus Rs 50k joining") is x12 on the first
 * pick only because the first currency-marked figure wins; the period is not bound per number.
 * Upgrade path: carry the figure's own currency in the extraction schema.
 */
export function extractMoney(text: string, currency = 'INR'): number | null {
    if (!text) return null;

    // Strip digit-group commas only ("5,00,000" -> "500000"), leaving list commas alone.
    const cleaned = text.replace(/(\d),(?=\d)/g, '$1');

    let bare: number | null = null;
    let bareMagnitude: number | null = null;
    for (const m of cleaned.matchAll(MONEY_TOKEN)) {
        const after = cleaned.slice(m.index! + m[0].length);
        if (!m[3] && NON_MONEY_AFTER.test(after)) continue;

        const value = parseFloat(m[2]) * (m[3] ? MAGNITUDE[m[3].toLowerCase()] : 1);
        if (!Number.isFinite(value)) continue;

        const marker = m[1] ? CURRENCY_MARKERS[m[1].toLowerCase()] : undefined;
        if (marker && marker !== currency) continue;   // foreign amount: do not guess
        if (marker) return Math.round(value * (PER_MONTH.test(cleaned) ? 12 : 1));
        // Preference: currency-marked > bare with a magnitude word ("2 lakh") > plain bare.
        if (m[3]) bareMagnitude ??= value;
        else bare ??= value;
    }

    const picked = bareMagnitude ?? bare;
    return picked === null ? null : Math.round(picked * (PER_MONTH.test(cleaned) ? 12 : 1));
}
/**
 * Extract a plain count (days, months) with no magnitude scaling.
 *
 * Kept separate from `extractMoney` on purpose: "18 days" must never be multiplied, and
 * "18 L" must never be read as a day count.
 */
export function extractCount(text: string): number | null {
    if (!text) return null;
    const match = text.match(/\d+(?:\.\d+)?/);
    if (!match) return null;
    const value = parseFloat(match[0]);
    return Number.isFinite(value) ? value : null;
}
