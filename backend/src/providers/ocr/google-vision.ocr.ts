import { OcrProvider, OcrResult } from './ocr.provider.js';
import vision from '@google-cloud/vision';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

import { config } from '@/config/index.js';

type Page = { confidence?: number | null; blocks?: Block[] | null };
type Block = { confidence?: number | null; paragraphs?: Paragraph[] | null };
type Paragraph = { confidence?: number | null; words?: Word[] | null };
type Word = { confidence?: number | null };

/** A usable 0-1 reading. Google returns 0 for "not computed" as often as for "certain it is wrong". */
function usable(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Derive one confidence figure for the document, or null when the response carries none.
 *
 * ── WHY THIS IS NOT ONE PROPERTY READ ────────────────────────────────────────
 * It used to be `pages[0].confidence || 0.85`, which had three problems: it ignored every page
 * but the first, it read `0` (Vision's value for "not computed") as falsy and substituted the
 * default, and the default was a number nobody measured. The net effect was a signal that was
 * always present, always ~0.85, and therefore always above any threshold — so the gate built on
 * it could not fire.
 *
 * Page-level confidence is the right answer when Vision provides it. `TEXT_DETECTION` frequently
 * does not, while still populating the word level, so the word confidences are averaged as a
 * second source. Both are real measurements; only their granularity differs.
 *
 * Returns null rather than a guess when neither is present. The caller must not read null as
 * low confidence, or a provider that simply reports nothing would fail every upload.
 *
 * NOT VERIFIED against a live response: Cloud Vision returns BILLING_DISABLED for this project,
 * so which of these levels is actually populated is from the API reference rather than observed.
 * The fallback chain is deliberately ordered so that being wrong about one level costs accuracy,
 * not correctness.
 */
export function deriveConfidence(pages: Page[] | null | undefined): number | null {
    if (!pages || pages.length === 0) return null;

    const pageLevel = pages.map((p) => p.confidence).filter(usable);
    if (pageLevel.length === pages.length) return mean(pageLevel);

    const words: number[] = [];
    for (const page of pages) {
        for (const block of page.blocks ?? []) {
            for (const paragraph of block.paragraphs ?? []) {
                for (const word of paragraph.words ?? []) {
                    if (usable(word.confidence)) words.push(word.confidence);
                }
            }
        }
    }

    // Any page-level readings we did find are better evidence than none at all.
    return mean(words) ?? mean(pageLevel);
}

export class GoogleVisionOcrProvider implements OcrProvider {
    readonly name = 'google-vision' as const;
    private client: vision.ImageAnnotatorClient;

    constructor() {
        this.client = new vision.ImageAnnotatorClient({
            keyFilename: config.GOOGLE_CLOUD_CREDENTIALS,
        });
    }

    async extractText(filePath: string): Promise<OcrResult> {
        try {
            const [result] = await this.client.textDetection(filePath);
            const detections = result.textAnnotations;

            if (!detections || detections.length === 0) {
                return { text: '', confidence: null };
            }

            // Full text is the first annotation
            const fullText = detections[0].description || '';

            return {
                text: fullText,
                confidence: deriveConfidence(result.fullTextAnnotation?.pages as Page[] | undefined),
            };
        } catch (error) {
            throw new AppError(
                ERROR_CODES.INTERNAL_ERROR,
                'OCR extraction failed',
                500,
                error
            );
        }
    }
}
