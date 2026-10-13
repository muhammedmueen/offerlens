import { COMPONENT_WEIGHTS, type ScoreComponentKey, type ScoreComponent } from '@/modules/analysis/score.rubric.js';

/**
 * Turn several analyses into a comparison matrix (plan task 19).
 *
 * ── WHY THIS IS NOT JUST A SORT ON `score` ───────────────────────────────────
 * The rubric redistributes the weight of any component it cannot score, so two stored scores are
 * not necessarily measured on the same basis. An offer with a salary benchmark of some kind
 * (crowdsourced or public survey) is scored across five components; one without is scored across
 * four, with salary's 30% spread over the rest. Ranking those two numbers against each other
 * compares different things and presents the result as if it were a like-for-like verdict.
 *
 * The same goes for two salary scores measured against different data: a city-level percentile of
 * crowdsourced submissions and an India-wide public-survey percentile are not the same quantity,
 * so salary only counts toward the common basis when every offer's salary basis matches.
 *
 * Task 15 made this more likely rather than less: the benefits checklist can now be absent too,
 * which takes benefits and growth with it.
 *
 * So the ranking runs on a COMMON BASIS — only the components every offer has a score for,
 * renormalised to 100. The same principle the eval harness already uses for `--runs N`, where a
 * multi-pass average counts only the cases that completed in every pass; averaging each pass's
 * survivors produced a flattering number from a shrinking sample.
 *
 * Each offer's own stored score is still reported, because that is what its results page shows.
 * The two are identical whenever the offers have the same data coverage, which is the common
 * case — they diverge exactly when the naive comparison would have been wrong, and the response
 * says so.
 *
 * ── WHY THE BACKEND FORMATS THE STRINGS ──────────────────────────────────────
 * `ComparePage` renders `row.values[i]` directly into a cell. It has no currency and no idea
 * which rows are "higher is better", so both live here with the data.
 */

export interface ComparisonEntry {
    id: string;
    company: string | null;
    role: string | null;
    /** The score on this offer's own results page, on its own basis. */
    score: number;
    scoreLabel: string;
    currency: string;
    totalCTC: number | null;
    baseSalary: number | null;
    redFlagCount: number;
    highSeverityCount: number;
    benefitCount: number;
    netMonthlyHigh: number | null;
    /** From `analyses.score_breakdown`. Null for rows written before task 10. */
    components: ScoreComponent[] | null;
}

export interface ComparisonRow {
    metric: string;
    values: string[];
    /** The offer id that wins this row, or null when it is a tie or not comparable. */
    winnerId: string | null;
    /** Why this row could not be compared, when it could not. */
    note?: string;
}

export interface ComparisonResult {
    offers: Array<{
        id: string;
        company: string | null;
        role: string | null;
        score: number;
        scoreLabel: string;
        /** Score on the common basis. Null when there is no shared basis at all. */
        comparableScore: number | null;
    }>;
    rows: ComparisonRow[];
    recommendation: {
        recommendedOfferId: string | null;
        company: string | null;
        reason: string;
        /**
         * Where the recommended offer LOSES, not where it wins.
         *
         * The table already marks every win with a tick, so repeating them here was a sales
         * pitch of eight bullet points. What a candidate cannot see at a glance is what they
         * give up by taking the higher-scoring offer — and that is also the list worth taking
         * into a negotiation.
         */
        tradeoffs: string[];
        caveat: string;
    };
    basis: {
        components: ScoreComponentKey[];
        excluded: ScoreComponentKey[];
        /** Set when the comparable score differs from a stored score for any offer. */
        note: string | null;
    };
    comparedAt: string;
}

const COMPONENT_LABELS: Record<ScoreComponentKey, string> = {
    redFlags: 'Red flags',
    salary: 'Salary vs market',
    benefits: 'Benefits',
    growth: 'Growth signals',
    transparency: 'Transparency',
};

const ALL_KEYS = Object.keys(COMPONENT_WEIGHTS) as ScoreComponentKey[];

function valueOf(entry: ComparisonEntry, key: ScoreComponentKey): number | null {
    const component = entry.components?.find((c) => c.key === key);
    return typeof component?.value === 'number' ? component.value : null;
}

/**
 * True when salary was deliberately left unscored because the survey has no respondents at the offer's
 * experience level (5.6). That is a gap in the survey, not a lower or higher salary: it never counts
 * as a win or a loss, and it is worded differently from "No data".
 */
function salaryWithheld(entry: ComparisonEntry): boolean {
    return Boolean(entry.components?.find((c) => c.key === 'salary')?.unscoredReason);
}

const SALARY_WITHHELD_NOTE = 'Not scored for at least one offer because the survey has no respondents at that '
    + 'offer\'s experience level. That is a gap in the survey, not a lower or higher salary, so no winner is '
    + 'shown and the row is excluded from the overall.';

/**
 * The components every offer has a score for.
 *
 * Empty when any offer has no breakdown at all, which is the pre-task-10 case — there is then
 * nothing shared to compare and the caller falls back to stored scores with a caveat.
 */
export function commonComponentKeys(entries: ComparisonEntry[]): ScoreComponentKey[] {
    if (entries.length === 0 || entries.some((e) => !e.components?.length)) return [];

    return ALL_KEYS.filter((key) =>
        entries.every((e) => valueOf(e, key) !== null)
        && !(key === 'salary' && salaryBasisMismatch(entries)));
}

/**
 * What a scored salary component was measured against, as `"${source}:${scope}"`.
 *
 * A scored component with no `basis` is a row stored before Phase 5, when the only salary
 * benchmark was a crowdsourced role + city percentile, so it reads as exactly that.
 *
 * ponytail: the role family is not part of the key, so two survey results for different roles
 * compare as the same basis. Offers in one comparison are usually for similar roles; the upgrade
 * path is to add the family to `basis`.
 */
export function salaryBasisKey(entry: ComparisonEntry): string | null {
    const salary = entry.components?.find((c) => c.key === 'salary');
    if (typeof salary?.value !== 'number') return null;
    return salary.basis ? `${salary.basis.source}:${salary.basis.scope}` : 'crowdsourced:role_city';
}

/** True when every offer has a salary score but they were measured against different data. */
export function salaryBasisMismatch(entries: ComparisonEntry[]): boolean {
    const keys = entries.map(salaryBasisKey);
    return keys.length > 0 && keys.every((k) => k !== null) && new Set(keys).size > 1;
}

const BASIS_MISMATCH_NOTE = 'Benchmarked against different data (for example city-level submissions against an '
    + 'India-wide public survey), so these percentiles are not directly comparable. Excluded from the overall.';

/** Weighted score over `keys` only, renormalised so those weights sum to 100. */
export function comparableScore(
    entry: ComparisonEntry,
    keys: ScoreComponentKey[],
): number | null {
    if (keys.length === 0) return null;

    const totalWeight = keys.reduce((sum, key) => sum + COMPONENT_WEIGHTS[key], 0);
    if (totalWeight === 0) return null;

    const weighted = keys.reduce((sum, key) => {
        const value = valueOf(entry, key);
        return value === null ? sum : sum + value * COMPONENT_WEIGHTS[key];
    }, 0);

    return Math.round(weighted / totalWeight);
}

function formatMoney(amount: number | null, currency: string): string {
    if (amount === null) return 'Not stated';
    const code = (currency || 'INR').toUpperCase();
    // Lakh grouping for rupees only; using it for any other currency mislabels the figure.
    return code === 'INR'
        ? `₹${amount.toLocaleString('en-IN')}`
        : `${code} ${amount.toLocaleString('en-US')}`;
}

/**
 * Which entry wins, by a numeric extractor.
 *
 * Returns null on a tie or when any value is missing — a row that cannot be compared for every
 * offer must not award a winner, because highlighting one column green is a claim.
 *
 * `higherIsBetter: false` for counts like red flags.
 */
function winnerBy(
    entries: ComparisonEntry[],
    pick: (e: ComparisonEntry) => number | null,
    higherIsBetter = true,
): string | null {
    const values = entries.map(pick);
    if (values.some((v) => v === null)) return null;

    const numbers = values as number[];
    const best = higherIsBetter ? Math.max(...numbers) : Math.min(...numbers);
    // A tie is not a win. Without this, the first column was silently declared the winner.
    if (numbers.filter((n) => n === best).length > 1) return null;

    return entries[numbers.indexOf(best)].id;
}

export function buildComparison(entries: ComparisonEntry[], now = new Date()): ComparisonResult {
    const keys = commonComponentKeys(entries);
    const excluded = ALL_KEYS.filter((k) => !keys.includes(k));
    const mismatch = keys.length > 0 && excluded.includes('salary') && salaryBasisMismatch(entries);
    // Excluded for lack of data, as opposed to excluded for a basis mismatch.
    const noData = excluded.filter((k) => !(k === 'salary' && mismatch));
    // 5.6: salary is missing for a policy reason, not for lack of data about the offer.
    const salaryGap = noData.includes('salary') && entries.some(salaryWithheld);
    const otherNoData = salaryGap ? noData.filter((k) => k !== 'salary') : noData;

    const comparable = new Map(entries.map((e) => [e.id, comparableScore(e, keys)]));
    const diverges = entries.some((e) => {
        const value = comparable.get(e.id);
        return value !== null && value !== undefined && value !== e.score;
    });

    const rows: ComparisonRow[] = [];

    // ── Overall, on the common basis ──
    if (keys.length > 0) {
        rows.push({
            metric: excluded.length > 0 ? 'Overall (comparable basis)' : 'Overall score',
            values: entries.map((e) => `${comparable.get(e.id)} / 100`),
            winnerId: winnerBy(entries, (e) => comparable.get(e.id) ?? null),
            ...(excluded.length > 0 && {
                note: [
                    otherNoData.length > 0
                        && `Excludes ${otherNoData.map((k) => COMPONENT_LABELS[k].toLowerCase()).join(', ')}, `
                            + 'which at least one of these offers has no data for.',
                    salaryGap
                        && 'Salary vs market is excluded because the survey has no data at one offer\'s experience level.',
                    mismatch
                        && 'Salary vs market is excluded because these offers were benchmarked against different data.',
                ].filter(Boolean).join(' '),
            }),
        });
    } else {
        rows.push({
            metric: 'Overall score',
            values: entries.map((e) => `${e.score} / 100`),
            winnerId: winnerBy(entries, (e) => e.score),
            note: 'These scores were not built from the same components, so this row is '
                + 'indicative rather than a like-for-like comparison.',
        });
    }

    // ── Dimension by dimension ──
    //
    // Every rubric component gets a row, including the excluded ones: "no data" in a cell is
    // information, and hiding the row would make the overall row's note unexplainable.
    for (const key of ALL_KEYS) {
        const comparableHere = entries.every((e) => valueOf(e, key) !== null);
        const differentBasis = key === 'salary' && mismatch;

        rows.push({
            metric: COMPONENT_LABELS[key],
            values: entries.map((e) => {
                const value = valueOf(e, key);
                if (value !== null) return `${value} / 100`;
                return key === 'salary' && salaryWithheld(e) ? 'Not scored' : 'No data';
            }),
            // Values stay visible, but no winner is declared across different data.
            winnerId: comparableHere && !differentBasis ? winnerBy(entries, (e) => valueOf(e, key)) : null,
            ...(differentBasis
                ? { note: BASIS_MISMATCH_NOTE }
                : key === 'salary' && entries.some(salaryWithheld)
                    ? { note: SALARY_WITHHELD_NOTE }
                    : !comparableHere && keys.length > 0 && {
                        note: 'Not scored for every offer, so it is excluded from the overall.',
                    }),
        });
    }

    // ── The underlying facts ──
    rows.push({
        metric: 'Total CTC',
        values: entries.map((e) => formatMoney(e.totalCTC, e.currency)),
        winnerId: winnerBy(entries, (e) => e.totalCTC),
    });

    rows.push({
        metric: 'Base salary (annual)',
        values: entries.map((e) => formatMoney(e.baseSalary, e.currency)),
        winnerId: winnerBy(entries, (e) => e.baseSalary),
        ...(entries.some((e) => e.baseSalary === null) && {
            note: 'Letters quoting a single CTC figure state no basic pay, so it is not compared.',
        }),
    });

    rows.push({
        metric: 'Take-home per month (upper estimate)',
        values: entries.map((e) => formatMoney(e.netMonthlyHigh, e.currency)),
        winnerId: winnerBy(entries, (e) => e.netMonthlyHigh),
        ...(entries.some((e) => e.netMonthlyHigh === null) && {
            note: 'Needs a stated CTC. Shown as a range on the results page; the upper end is used here.',
        }),
    });

    // "Red flags found", not "Red flags": that is the component row's label, and two rows sharing
    // a metric name is both ambiguous on screen and a duplicate React key, since ComparePage
    // keys rows by metric.
    rows.push({
        metric: 'Red flags found',
        values: entries.map((e) => (e.highSeverityCount > 0
            ? `${e.redFlagCount} (${e.highSeverityCount} serious)`
            : `${e.redFlagCount}`)),
        winnerId: winnerBy(entries, (e) => e.redFlagCount, false),
    });

    rows.push({
        metric: 'Benefits listed',
        values: entries.map((e) => `${e.benefitCount}`),
        winnerId: winnerBy(entries, (e) => e.benefitCount),
    });

    return {
        offers: entries.map((e) => ({
            id: e.id,
            company: e.company,
            role: e.role,
            score: e.score,
            scoreLabel: e.scoreLabel,
            comparableScore: comparable.get(e.id) ?? null,
        })),
        rows,
        recommendation: recommend(entries, rows, comparable, keys),
        basis: {
            components: keys,
            excluded,
            note: diverges
                ? 'The comparable score differs from the score on an offer\'s own page because '
                    + 'that page scores each offer on whatever data it has, while this comparison '
                    + 'uses only the factors all of these offers share.'
                : null,
        },
        comparedAt: now.toISOString(),
    };
}

/**
 * Pick a winner and say why, from the rows already computed.
 *
 * Derived from the rows rather than recomputed, so the recommendation cannot contradict the
 * table the user is reading.
 */
function recommend(
    entries: ComparisonEntry[],
    rows: ComparisonRow[],
    comparable: Map<string, number | null>,
    keys: ScoreComponentKey[],
): ComparisonResult['recommendation'] {
    const rank = (e: ComparisonEntry) => comparable.get(e.id) ?? e.score;
    const sorted = [...entries].sort((a, b) => rank(b) - rank(a));
    const best = sorted[0];
    const runnerUp = sorted[1];

    const tied = runnerUp !== undefined && rank(runnerUp) === rank(best);

    if (tied) {
        return {
            recommendedOfferId: null,
            company: null,
            reason: `These offers score the same (${rank(best)}/100) on the factors they have in `
                + 'common, so the decision is not a numeric one.',
            // On a tie there is no "recommended offer" to trade off against, so the useful
            // content is which offer leads where.
            tradeoffs: rows
                .filter((r) => r.winnerId !== null && !r.metric.startsWith('Overall'))
                .map((r) => {
                    const winner = entries.find((e) => e.id === r.winnerId);
                    return `${r.metric}: ${winner?.company ?? 'one offer'} leads `
                        + `(${valueFor(r, entries, r.winnerId!)})`;
                }),
            caveat: CAVEAT,
        };
    }

    // Metric casing is preserved rather than lowercased: "Total CTC" became "total ctc", and
    // CTC is an initialism, not a word.
    const lostRows = rows.filter((r) => r.winnerId !== null && r.winnerId !== best.id);
    const margin = runnerUp ? rank(best) - rank(runnerUp) : null;

    return {
        recommendedOfferId: best.id,
        company: best.company,
        reason: margin !== null && margin <= 5
            ? `${best.company ?? 'This offer'} scores ${rank(best)}/100 against `
                + `${rank(runnerUp!)}/100 — close enough that the differences below matter more `
                + 'than the total.'
            : `${best.company ?? 'This offer'} scores ${rank(best)}/100`
                + (runnerUp ? ` against ${rank(runnerUp)}/100` : '')
                + (keys.length > 0 ? ` on ${keys.length} shared factor(s).` : '.'),
        tradeoffs: lostRows.map((r) => {
            const winner = entries.find((e) => e.id === r.winnerId);
            return `Gives up ${r.metric}: ${winner?.company ?? 'the other offer'} has `
                + `${valueFor(r, entries, r.winnerId!)} against ${valueFor(r, entries, best.id)}`;
        }),
        caveat: CAVEAT,
    };
}

const CAVEAT = 'This is a reading of what the letters say, not advice. Team, manager, '
    + 'growth and how the interviews felt are not in here, and they routinely outweigh a few '
    + 'points of score.';

function valueFor(row: ComparisonRow, entries: ComparisonEntry[], offerId: string): string {
    const index = entries.findIndex((e) => e.id === offerId);
    return index >= 0 ? row.values[index] : '—';
}
