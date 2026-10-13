import { describe, it, expect } from 'vitest';
import { addSteps, progressionNotes, type ProgressionCell, type ProgressionSource } from './progression.js';

const cell = (p50: number | null, source: ProgressionSource | null = p50 === null ? null : 'public_survey'): ProgressionCell => ({
    bracket: 'b', yearsRange: { min: 0, max: 1 }, sampleSize: 12, crowdN: 0, source, step: null,
    marketRange: p50 === null ? null : { p25: p50 - 1, p50, p75: p50 + 1 },
});

describe('addSteps', () => {
    it('absolute is the p50 difference and percent is a rounded integer', () => {
        const [, b] = addSteps([cell(2_000_000), cell(2_340_000)]);
        expect(b.step).toEqual({ absolute: 340_000, percent: 17 });
    });

    it('can be negative (the survey is cross-sectional, not one person\'s raises)', () => {
        const [, b] = addSteps([cell(2_000_000), cell(1_900_000)]);
        expect(b.step).toEqual({ absolute: -100_000, percent: -5 });
    });

    it('a percent that rounds to zero stays 0, not null', () => {
        const [, b] = addSteps([cell(2_000_000), cell(2_001_000)]);
        expect(b.step).toEqual({ absolute: 1_000, percent: 0 });
    });

    it('the first cell and a thin cell get no step', () => {
        const out = addSteps([cell(2_000_000), cell(null), cell(2_500_000)]);
        expect(out.map((c) => c.step)).toEqual([null, null, null]); // no step across a gap either
    });

    it('never steps across a survey / crowd boundary', () => {
        const out = addSteps([cell(2_000_000, 'public_survey'), cell(2_500_000, 'crowdsourced'), cell(2_800_000, 'crowdsourced')]);
        expect(out[1].step).toBeNull();
        expect(out[2].step).toEqual({ absolute: 300_000, percent: 12 });
    });

    it('does not mutate its input', () => {
        const input = [cell(1), cell(2)];
        addSteps(input);
        expect(input[1].step).toBeNull();
    });
});

describe('progressionNotes', () => {
    it('always has the survey note, and no crowd note when every cell is survey or thin', () => {
        const notes = progressionNotes([cell(2_000_000), cell(null)], ['Backend Engineer']);
        expect(notes.map((n) => n.source)).toEqual(['public_survey']);
        expect(notes[0].disclaimer).toContain('Modelled from public surveys, not offers in your city.');
        expect(notes[0].disclaimer).toContain('Backend Engineer respondents');
    });

    it('adds the fixed crowd note when a cell is crowdsourced, and never interpolates a sample size', () => {
        const c = { ...cell(2_000_000, 'crowdsourced'), sampleSize: 4321 };
        const notes = progressionNotes([c], ['Backend Engineer']);
        expect(notes.map((n) => n.source)).toEqual(['public_survey', 'crowdsourced']);
        for (const n of notes) expect(n.disclaimer).not.toMatch(/4321|\bn\s*=/);
        expect(notes[1].disclaimer).toContain('unverified submissions');
    });
});
