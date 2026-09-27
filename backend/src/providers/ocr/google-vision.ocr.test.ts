import { describe, it, expect } from 'vitest';
import { deriveConfidence } from './google-vision.ocr.js';
import { OCR_MIN_CONFIDENCE } from '@/config/constants.js';

/**
 * The property that matters is that a MISSING confidence stays missing.
 *
 * The old implementation was `pages[0].confidence || 0.85`. Every consequence of that flowed from
 * the default: the value was always present, always above any threshold, and never measured — so
 * the low-confidence gate built on top of it could not fire on a real document, and the
 * per-field confidence machinery from task 11 had nothing true to work with.
 *
 * These cases are built from the Cloud Vision response reference rather than from observed
 * responses, because the project's billing is disabled. That is why the fallback order is
 * asserted explicitly: if the assumption about which level Vision populates turns out wrong, the
 * failure should be a less precise number, never an invented one.
 */

const word = (confidence?: number | null) => ({ confidence });
const page = (confidence: number | null | undefined, words: Array<number | null | undefined> = []) => ({
    confidence,
    blocks: [{ paragraphs: [{ words: words.map(word) }] }],
});

describe('deriveConfidence', () => {
    it('returns null for a response with no pages', () => {
        expect(deriveConfidence(undefined)).toBeNull();
        expect(deriveConfidence(null)).toBeNull();
        expect(deriveConfidence([])).toBeNull();
    });

    it('never invents 0.85, or any other default', () => {
        // The whole bug, in one assertion.
        expect(deriveConfidence([page(undefined)])).not.toBe(0.85);
        expect(deriveConfidence([page(undefined)])).toBeNull();
    });

    it('uses page confidence when it is present', () => {
        expect(deriveConfidence([page(0.93)])).toBeCloseTo(0.93, 6);
    });

    it('averages across every page, not just the first', () => {
        // `pages[0].confidence` ignored the rest of a multi-page document entirely.
        expect(deriveConfidence([page(0.9), page(0.5)])).toBeCloseTo(0.7, 6);
    });

    it('falls back to word confidences when the page level is absent', () => {
        // TEXT_DETECTION often populates the word level and not the page level, which is the
        // situation the 0.85 default was papering over.
        expect(deriveConfidence([page(undefined, [0.8, 0.9, 1.0])])).toBeCloseTo(0.9, 6);
    });

    it('prefers word confidences over a partial set of page readings', () => {
        // One page reporting and one not is not a document-level figure.
        const pages = [page(0.99, [0.5, 0.5]), page(undefined, [0.5, 0.5])];
        expect(deriveConfidence(pages)).toBeCloseTo(0.5, 6);
    });

    it('uses the page readings it has when there are no words at all', () => {
        expect(deriveConfidence([page(0.8), page(undefined)])).toBeCloseTo(0.8, 6);
    });

    it('treats zero as "not computed", which is what Vision means by it', () => {
        // `|| 0.85` did this accidentally and then substituted a lie. Skipping the value and
        // reporting null is the same judgement without the fabrication.
        expect(deriveConfidence([page(0)])).toBeNull();
        expect(deriveConfidence([page(0, [0, 0])])).toBeNull();
    });

    it('ignores impossible readings rather than propagating them', () => {
        for (const bad of [-1, 1.5, NaN, Infinity, null, undefined, '0.9' as never]) {
            expect(deriveConfidence([page(bad as number)]), String(bad)).toBeNull();
        }
    });

    it('can produce a value below the warning threshold, which the old code could not', () => {
        // A blurry photo. Under `|| 0.85` this document reported 0.85 and sailed through.
        const result = deriveConfidence([page(undefined, [0.4, 0.5, 0.45])]);
        expect(result).not.toBeNull();
        expect(result!).toBeLessThan(OCR_MIN_CONFIDENCE);
    });

    it('tolerates a page with no block structure', () => {
        expect(deriveConfidence([{ confidence: undefined }])).toBeNull();
        expect(deriveConfidence([{ confidence: undefined, blocks: null }])).toBeNull();
        expect(deriveConfidence([{ confidence: 0.7, blocks: null }])).toBeCloseTo(0.7, 6);
    });
});
