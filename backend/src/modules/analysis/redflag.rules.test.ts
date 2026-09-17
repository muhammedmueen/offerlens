import { describe, it, expect } from 'vitest';
import { detectRedFlags, mergeRedFlags, splitSentences, normalise, RULES } from './redflag.rules.js';
import type { RedFlag } from './analysis.types.js';
import { CORPUS } from '../../../eval/corpus.js';

const typesFor = (text: string) => detectRedFlags(text).map((f) => f.type).sort();
const caseText = (id: string) => {
    const found = CORPUS.find((c) => c.id === id);
    if (!found) throw new Error(`corpus case ${id} not found`);
    return found.text;
};

describe('splitSentences', () => {
    it('does not split inside an abbreviation', () => {
        // Without masking, this quote ends at "a sum of Rs." and loses the words the
        // clawback rule matches on.
        const parts = splitSentences('You shall reimburse the Company a sum of Rs. 2,00,000 towards costs.');
        expect(parts).toHaveLength(1);
        expect(parts[0]).toContain('Rs. 2,00,000');
    });

    it('splits on sentence punctuation', () => {
        expect(splitSentences('One thing. Two things; three')).toEqual([
            'One thing', 'Two things', 'three',
        ]);
    });

    it('joins a sentence wrapped across lines', () => {
        // The bug that shipped in the first draft: splitting on every newline put the
        // negation cue in a different fragment from the trigger, and the rule fired on a
        // clause that disclaims the restriction. PDF extraction wraps like this always.
        const wrapped = 'obligations. The Company does not impose any\npost-employment non-compete restriction.';
        expect(splitSentences(wrapped)).toContain('The Company does not impose any post-employment non-compete restriction.');
    });

    it('keeps numbered clauses and bullets as their own blocks', () => {
        const text = 'Terms follow\n1. First clause here\n2. Second clause here\n- A bullet';
        expect(splitSentences(text)).toEqual([
            'Terms follow', '1', 'First clause here', '2', 'Second clause here', '- A bullet',
        ]);
    });
});

describe('normalise', () => {
    it('folds the hyphen variants Word produces', () => {
        expect(normalise('non-compete')).toBe('non compete');
        expect(normalise('non\u2013compete')).toBe('non compete');  // en dash
        expect(normalise('Non Compete')).toBe('non compete');
    });

    it('drops apostrophes so "15 days\u2019 notice" is matchable', () => {
        expect(normalise('15 days\u2019 written notice')).toBe('15 days written notice');
    });
});

/**
 * The precision half. This is the reason the rule engine is not a keyword grep.
 *
 * Case 17 is a real letter whose clauses each NAME a red flag in order to disclaim it.
 * Every assertion here fails on a naive `includes` implementation.
 */
describe('05 vs 17 — the same clauses, hostile then favourable', () => {
    it('finds the genuine clauses in 05-red-flag-heavy', () => {
        const types = typesFor(caseText('05-red-flag-heavy'));
        expect(types).toContain('non_compete');
        expect(types).toContain('ip_assignment');
        expect(types).toContain('clawback');
        expect(types).toContain('probation');
    });

    it('finds NOTHING in 17-deliberately-clean', () => {
        // A false positive here is worse than a miss: it turns a candidate-friendly letter
        // into a scary one and discredits every flag the product raises.
        expect(detectRedFlags(caseText('17-deliberately-clean'))).toEqual([]);
    });
});

describe('negation cues', () => {
    it('does not flag a disclaimed non-compete', () => {
        expect(typesFor('The Company does not impose any post-employment non-compete restriction.'))
            .not.toContain('non_compete');
    });

    it('DOES flag a non-compete written with "shall not"', () => {
        // The inverse trap. In legal prose "shall not" usually introduces the candidate's
        // obligation, so it can never be treated as a negation cue.
        expect(typesFor('You shall not, for a period of 18 months, engage in any business competing with the Company.'))
            .toContain('non_compete');
    });

    it('does not flag a bonus that is explicitly not clawed back', () => {
        expect(typesFor('The joining bonus of Rs. 1,00,000 is not subject to a repayment or clawback obligation.'))
            .not.toContain('clawback');
    });

    it('DOES flag a bonus that is recoverable', () => {
        expect(typesFor('The joining bonus of Rs. 1,50,000 is recoverable in full should you leave within 12 months.'))
            .toContain('clawback');
    });
});

describe('probation rule keys off missing notice, not the word "probation"', () => {
    it('ignores a probation with notice on both sides', () => {
        expect(typesFor("During probation, either party may terminate by providing 15 days' written notice."))
            .not.toContain('probation');
    });

    it('flags probation with no notice and no reason', () => {
        expect(typesFor('During probation, your services may be terminated without notice and without assigning any reason.'))
            .toContain('probation');
    });
});

describe('IP rule keys off overbreadth, not the topic', () => {
    it('ignores a narrow, ordinary IP clause', () => {
        // Assigning work you did for the company, using their resources, is standard.
        expect(typesFor('Intellectual property created specifically in the course of your assigned duties using Company resources shall belong to the Company.'))
            .not.toContain('ip_assignment');
    });

    it('flags an assignment that reaches outside working hours', () => {
        expect(typesFor('All intellectual property created by you during the term of your employment, whether or not during working hours, shall vest absolutely with the Company.'))
            .toContain('ip_assignment');
    });

    it('is disarmed by a carve-out in a FOLLOWING sentence', () => {
        // Carve-outs are conventionally written as the next sentence, so this guard has to
        // be document-scoped. A sentence-scoped check flags a letter that protects the
        // candidate.
        const text = 'All intellectual property created by you shall vest absolutely with the Company. '
            + 'Your pre-existing intellectual property and personal projects created without Company resources shall remain yours.';
        expect(typesFor(text)).not.toContain('ip_assignment');
    });
});

describe('vague compensation requires a compensation context', () => {
    it('flags discretionary variable pay', () => {
        expect(typesFor('Sales incentive: up to Rs. 9,00,000 per annum, entirely dependent on targets as determined by management.'))
            .toContain('vague_compensation');
    });

    it('does NOT flag a termination clause that happens to say "sole discretion"', () => {
        // Scoring a vague_compensation hit off a termination clause would flatter the eval
        // number while telling the user something false.
        expect(typesFor('The Company reserves the right to terminate immediately for unsatisfactory performance, at its sole discretion.'))
            .not.toContain('vague_compensation');
    });
});

describe('detectRedFlags contract', () => {
    it('quotes verbatim from the source, so the hallucination guard cannot drop it', () => {
        const text = 'You shall not solicit or accept work from any client of the Company for 12 months following termination.';
        const [flag] = detectRedFlags(text);
        expect(text).toContain(flag.matchedText);
    });

    it('reports each rule at most once', () => {
        const text = 'You shall not engage in any business competing with the Company. '
            + 'You shall not solicit any client of the Company. '
            + 'Further, business competing with the Company is prohibited.';
        expect(detectRedFlags(text).filter((f) => f.type === 'non_compete')).toHaveLength(1);
    });

    it('survives empty and non-string input', () => {
        expect(detectRedFlags('')).toEqual([]);
        expect(detectRedFlags('   ')).toEqual([]);
        expect(detectRedFlags(undefined as never)).toEqual([]);
    });

    it('every rule carries user-facing copy', () => {
        // A flag with no explanation or suggestion is worse than no flag — it alarms
        // without telling anyone what to do.
        for (const rule of RULES) {
            expect(rule.title.length, rule.id).toBeGreaterThan(0);
            expect(rule.explanation.length, rule.id).toBeGreaterThan(40);
            expect(rule.suggestion.length, rule.id).toBeGreaterThan(20);
            expect(rule.triggers.length, rule.id).toBeGreaterThan(0);
        }
    });

    it('completes a 100k-char letter well inside the 100ms budget', () => {
        // Stands in for the wall-clock timeout the plan sketched. `includes` over sentences
        // has no backtracking, so the guard that matters is input length — already capped
        // upstream by MAX_EXTRACT_TEXT_CHARS.
        const filler = 'This is an ordinary sentence about nothing in particular. ';
        const text = filler.repeat(Math.ceil(100_000 / filler.length));
        const start = performance.now();
        detectRedFlags(text);
        expect(performance.now() - start).toBeLessThan(100);
    });
});

describe('mergeRedFlags', () => {
    const aiFlag = (type: RedFlag['type']): RedFlag => ({
        type, severity: 'low', title: 'AI', explanation: 'ai', matchedText: 'ai', suggestion: 'ai',
    });

    it('prefers the deterministic flag when both found the same type', () => {
        const rules = detectRedFlags('The joining bonus is recoverable in full if you leave within 12 months.');
        const merged = mergeRedFlags(rules, [aiFlag('clawback')]);
        expect(merged.filter((f) => f.type === 'clawback')).toHaveLength(1);
        expect(merged.find((f) => f.type === 'clawback')?.title).not.toBe('AI');
    });

    it('keeps AI flags of types the rules do not cover', () => {
        const merged = mergeRedFlags([], [aiFlag('other')]);
        expect(merged.map((f) => f.type)).toEqual(['other']);
    });

    it('strips the internal ruleId from what gets stored', () => {
        const rules = detectRedFlags('All inventions shall vest absolutely with the Company.');
        expect(rules.length).toBeGreaterThan(0);
        for (const flag of mergeRedFlags(rules, [])) {
            expect(flag).not.toHaveProperty('ruleId');
        }
    });

    it('tolerates a non-array from the model', () => {
        expect(mergeRedFlags([], undefined as never)).toEqual([]);
    });
});
