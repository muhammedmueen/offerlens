import { describe, it, expect } from 'vitest';
import {
    buildComparison, commonComponentKeys, comparableScore, type ComparisonEntry,
} from './comparison.matrix.js';
import { COMPONENT_WEIGHTS, type ScoreComponent, type ScoreComponentKey } from '@/modules/analysis/score.rubric.js';

/**
 * The claim under test is that two offers are never ranked on different bases.
 *
 * The rubric redistributes the weight of anything it cannot score, so a stored score is only
 * meaningful relative to the components that produced it. Sorting two of them ignores that, and
 * task 15 made it more likely by adding another way for components to disappear.
 */

/** Components with the weights the rubric would have applied, given which ones are scored. */
function componentsFor(values: Partial<Record<ScoreComponentKey, number | null>>): ScoreComponent[] {
    const keys = Object.keys(COMPONENT_WEIGHTS) as ScoreComponentKey[];
    const scoredWeight = keys
        .filter((k) => typeof values[k] === 'number')
        .reduce((sum, k) => sum + COMPONENT_WEIGHTS[k], 0);
    const scale = scoredWeight > 0 ? 100 / scoredWeight : 0;

    return keys.map((key) => ({
        key,
        label: key,
        value: typeof values[key] === 'number' ? values[key] as number : null,
        weight: typeof values[key] === 'number' ? Math.round(COMPONENT_WEIGHTS[key] * scale) : 0,
        note: '',
    }));
}

/** The score the rubric would have stored for those component values. */
function storedScoreFor(values: Partial<Record<ScoreComponentKey, number | null>>): number {
    const keys = Object.keys(COMPONENT_WEIGHTS) as ScoreComponentKey[];
    const scored = keys.filter((k) => typeof values[k] === 'number');
    const scoredWeight = scored.reduce((sum, k) => sum + COMPONENT_WEIGHTS[k], 0);
    if (scoredWeight === 0) return 0;
    const scale = 100 / scoredWeight;
    return Math.round(
        scored.reduce((sum, k) => sum + (values[k] as number) * COMPONENT_WEIGHTS[k] * scale, 0) / 100,
    );
}

const entry = (
    id: string,
    values: Partial<Record<ScoreComponentKey, number | null>>,
    over: Partial<ComparisonEntry> = {},
): ComparisonEntry => ({
    id,
    company: `Company ${id}`,
    role: 'Engineer',
    score: storedScoreFor(values),
    scoreLabel: 'good',
    currency: 'INR',
    totalCTC: 1_800_000,
    baseSalary: 900_000,
    redFlagCount: 0,
    highSeverityCount: 0,
    benefitCount: 3,
    netMonthlyHigh: 120_000,
    components: componentsFor(values),
    ...over,
});

const FULL = { redFlags: 100, salary: 70, benefits: 75, growth: 50, transparency: 80 };
const NO_SALARY = { ...FULL, salary: null };

describe('commonComponentKeys', () => {
    it('is every component when both offers have full data', () => {
        expect(commonComponentKeys([entry('a', FULL), entry('b', FULL)]))
            .toEqual(['redFlags', 'salary', 'benefits', 'growth', 'transparency']);
    });

    it('drops a component only one offer has', () => {
        // The case this whole module exists for: one offer was benchmarked, the other was not.
        expect(commonComponentKeys([entry('a', FULL), entry('b', NO_SALARY)]))
            .not.toContain('salary');
    });

    it('drops benefits and growth together when a checklist failed', () => {
        // Task 15's degraded shape.
        const degraded = { redFlags: 100, salary: null, benefits: null, growth: null, transparency: 80 };
        expect(commonComponentKeys([entry('a', NO_SALARY), entry('b', degraded)]))
            .toEqual(['redFlags', 'transparency']);
    });

    it('is empty when any offer has no breakdown at all', () => {
        // Rows written before task 10's migration.
        expect(commonComponentKeys([entry('a', FULL), entry('b', FULL, { components: null })])).toEqual([]);
        expect(commonComponentKeys([entry('a', FULL), entry('b', FULL, { components: [] })])).toEqual([]);
    });

    it('is empty for no entries', () => {
        expect(commonComponentKeys([])).toEqual([]);
    });
});

describe('comparableScore', () => {
    it('renormalises the shared weights to 100', () => {
        // redFlags 30 + transparency 10 = 40, rescaled: (100*30 + 80*10) / 40 = 95.
        expect(comparableScore(entry('a', FULL), ['redFlags', 'transparency'])).toBe(95);
    });

    it('equals the stored score when every component is shared', () => {
        const e = entry('a', FULL);
        expect(comparableScore(e, ['redFlags', 'salary', 'benefits', 'growth', 'transparency']))
            .toBe(e.score);
    });

    it('is null with no shared components', () => {
        expect(comparableScore(entry('a', FULL), [])).toBeNull();
    });
});

describe('the cross-basis bug this task fixes', () => {
    it('reverses the ranking a naive sort on stored score produces', () => {
        // A was benchmarked and sits badly in the market (salary 20 of 100). It is otherwise the
        // stronger letter: no red flags, better benefits.
        const a = entry('a', { redFlags: 100, salary: 20, benefits: 80, growth: 50, transparency: 50 });
        // B was never benchmarked, so salary's 30% was redistributed over its other four
        // components — all mediocre at 70.
        const b = entry('b', { redFlags: 70, salary: null, benefits: 70, growth: 70, transparency: 70 });

        // Stored scores: B looks better. Not because B is better, but because A's weakest
        // dimension counted against it and B's equivalent was never measured.
        expect(a.score).toBe(62);
        expect(b.score).toBe(70);

        const result = buildComparison([a, b]);
        const overall = result.rows.find((r) => r.metric.startsWith('Overall'))!;

        // On the four factors they actually share, A is ahead by ten points. Opposite verdict.
        expect(result.offers[0].comparableScore).toBe(80);
        expect(result.offers[1].comparableScore).toBe(70);
        expect(overall.winnerId).toBe('a');
        expect(result.recommendation.recommendedOfferId).toBe('a');
    });

    it('reports the excluded components rather than quietly dropping them', () => {
        const result = buildComparison([entry('a', FULL), entry('b', NO_SALARY)]);

        expect(result.basis.excluded).toEqual(['salary']);
        expect(result.rows.find((r) => r.metric.startsWith('Overall'))!.metric)
            .toBe('Overall (comparable basis)');
        expect(result.rows.find((r) => r.metric.startsWith('Overall'))!.note)
            .toContain('salary vs market');
    });

    it('explains a divergence from the score on an offer\'s own page', () => {
        const result = buildComparison([entry('a', FULL), entry('b', NO_SALARY)]);
        expect(result.basis.note).toContain('own page');
    });

    it('adds no divergence note when both offers lack the same component', () => {
        // Both unbenchmarked, which is the common case. Salary is still excluded from the basis
        // and the row says so — but neither comparable score differs from its stored score, so
        // there is nothing to reconcile against the results page.
        const result = buildComparison([entry('a', NO_SALARY), entry('b', NO_SALARY)]);

        expect(result.basis.note).toBeNull();
        expect(result.basis.excluded).toEqual(['salary']);
        expect(result.offers[0].comparableScore).toBe(result.offers[0].score);
    });

    it('titles the overall row plainly when nothing was excluded', () => {
        const result = buildComparison([entry('a', FULL), entry('b', FULL)]);
        expect(result.rows.find((r) => r.metric === 'Overall score')).toBeDefined();
        expect(result.basis.excluded).toEqual([]);
    });
});

describe('rows', () => {
    const result = buildComparison([
        entry('a', FULL, { totalCTC: 2_400_000, redFlagCount: 1, highSeverityCount: 1 }),
        entry('b', NO_SALARY, { totalCTC: 1_800_000, redFlagCount: 3, benefitCount: 5 }),
    ]);
    const row = (metric: string) => result.rows.find((r) => r.metric === metric)!;

    it('gives every rubric component its own row, including unscored ones', () => {
        for (const metric of ['Red flags', 'Salary vs market', 'Benefits', 'Growth signals', 'Transparency']) {
            expect(row(metric), metric).toBeDefined();
        }
        // "No data" in a cell is information; hiding the row would make the overall note unexplainable.
        expect(row('Salary vs market').values).toContain('No data');
        expect(row('Salary vs market').winnerId).toBeNull();
    });

    it('awards fewer red flags, not more', () => {
        expect(row('Red flags found').winnerId).toBe('a');
        expect(row('Red flags found').values[0]).toBe('1 (1 serious)');
        expect(row('Red flags found').values[1]).toBe('3');
    });

    it('gives every row a unique metric name', () => {
        // ComparePage keys rows by metric, so a duplicate is a React key collision as well as
        // two differently-meaning rows with the same label. The count row and the rubric
        // component row were both called "Red flags".
        const metrics = result.rows.map((r) => r.metric);
        expect(new Set(metrics).size).toBe(metrics.length);
    });

    it('awards the higher CTC', () => {
        expect(row('Total CTC').winnerId).toBe('a');
        expect(row('Total CTC').values[0]).toBe('₹24,00,000');
    });

    it('declares no winner on a tie', () => {
        // Before this, indexOf on the max silently crowned the first column.
        const tied = buildComparison([entry('a', FULL), entry('b', FULL)]);
        expect(tied.rows.find((r) => r.metric === 'Total CTC')!.winnerId).toBeNull();
        expect(tied.rows.find((r) => r.metric.startsWith('Overall'))!.winnerId).toBeNull();
    });

    it('declares no winner when a value is missing for any offer', () => {
        const partial = buildComparison([
            entry('a', FULL),
            entry('b', FULL, { totalCTC: null, baseSalary: null, netMonthlyHigh: null }),
        ]);

        expect(partial.rows.find((r) => r.metric === 'Total CTC')!.winnerId).toBeNull();
        expect(partial.rows.find((r) => r.metric === 'Total CTC')!.values[1]).toBe('Not stated');
        expect(partial.rows.find((r) => r.metric === 'Base salary (annual)')!.note).toContain('single CTC figure');
    });
});

describe('recommendation', () => {
    it('never contradicts the table', () => {
        const result = buildComparison([
            entry('a', FULL, { redFlagCount: 0 }),
            entry('b', NO_SALARY, { redFlagCount: 4 }),
        ]);

        const winner = result.recommendation.recommendedOfferId;
        const overall = result.rows.find((r) => r.metric.startsWith('Overall'))!;
        expect(winner).toBe(overall.winnerId);
    });

    it('refuses to pick a winner when the scores tie', () => {
        const result = buildComparison([entry('a', FULL), entry('b', FULL)]);
        expect(result.recommendation.recommendedOfferId).toBeNull();
        expect(result.recommendation.reason).toContain('not a numeric one');
    });

    it('lists only what the winner gives up, not what it wins', () => {
        // The table ticks every win already. Repeating them produced an eight-bullet sales
        // pitch; the losing rows are the ones worth taking into a negotiation.
        const result = buildComparison([
            entry('a', { redFlags: 100, salary: null, benefits: 100, growth: 100, transparency: 100 },
                { totalCTC: 1_200_000 }),
            entry('b', { redFlags: 20, salary: null, benefits: 20, growth: 20, transparency: 20 },
                { totalCTC: 3_000_000 }),
        ]);

        expect(result.recommendation.recommendedOfferId).toBe('a');
        expect(result.recommendation.tradeoffs).toEqual([
            'Gives up Total CTC: Company b has ₹30,00,000 against ₹12,00,000',
        ]);
    });

    it('preserves metric casing, because CTC is an initialism', () => {
        // `metric.toLowerCase()` rendered "Total CTC" as "total ctc".
        const result = buildComparison([
            entry('a', NO_SALARY, { totalCTC: 1_200_000 }),
            entry('b', NO_SALARY, { totalCTC: 3_000_000 }),
        ]);

        expect(result.recommendation.tradeoffs.join(' ')).toContain('Total CTC');
        expect(result.recommendation.tradeoffs.join(' ')).not.toContain('total ctc');
    });

    it('has nothing to trade off when the winner wins everything', () => {
        const result = buildComparison([
            entry('a', { redFlags: 100, salary: null, benefits: 100, growth: 100, transparency: 100 },
                { totalCTC: 3_000_000, netMonthlyHigh: 200_000, benefitCount: 6 }),
            entry('b', { redFlags: 20, salary: null, benefits: 20, growth: 20, transparency: 20 },
                { totalCTC: 1_200_000, netMonthlyHigh: 90_000, benefitCount: 1, redFlagCount: 3 }),
        ]);

        expect(result.recommendation.tradeoffs).toEqual([]);
    });

    it('says when the margin is too thin to lean on', () => {
        const a = entry('a', { redFlags: 100, salary: null, benefits: 75, growth: 50, transparency: 80 });
        const b = entry('b', { redFlags: 98, salary: null, benefits: 75, growth: 50, transparency: 80 });
        const result = buildComparison([a, b]);

        expect(result.recommendation.reason).toContain('close enough');
    });

    it('always carries the non-quantifiable caveat', () => {
        const result = buildComparison([entry('a', FULL), entry('b', NO_SALARY)]);
        expect(result.recommendation.caveat.toLowerCase()).toContain('not advice');
    });
});

describe('pre-task-10 rows', () => {
    it('falls back to stored scores and says the comparison is indicative', () => {
        const result = buildComparison([
            entry('a', FULL, { components: null, score: 80 }),
            entry('b', FULL, { components: null, score: 60 }),
        ]);

        const overall = result.rows.find((r) => r.metric === 'Overall score')!;
        expect(overall.values).toEqual(['80 / 100', '60 / 100']);
        expect(overall.winnerId).toBe('a');
        expect(overall.note).toContain('not built from the same components');
        expect(result.offers[0].comparableScore).toBeNull();
    });
});
