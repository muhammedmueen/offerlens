import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppError } from '@/shared/errors/app-error.js';
import { OCR_MIN_CONFIDENCE } from '@/config/constants.js';

// ─── Mock the Azure SDK so NO real network call is ever made ──────────────────
//
// The provider talks to exactly three SDK exports: the default client factory, `isUnexpected`
// and `getLongRunningPoller`. Each test scripts them through these hoisted hooks. If a test
// forgets to script a path, the default throws — a real call is impossible from here.
const h = vi.hoisted(() => ({
    postResult: null as unknown,
    unexpected: false,
    pollerBody: null as unknown,
    pollerThrows: null as Error | null,
    pollerDelayMs: 0,
}));

vi.mock('@azure-rest/ai-document-intelligence', () => ({
    default: () => ({
        path: () => ({ post: () => Promise.resolve(h.postResult) }),
    }),
    isUnexpected: () => h.unexpected,
    getLongRunningPoller: () => ({
        pollUntilDone: () =>
            h.pollerThrows
                ? Promise.reject(h.pollerThrows)
                : new Promise((resolve) =>
                      setTimeout(() => resolve({ body: h.pollerBody }), h.pollerDelayMs),
                  ),
    }),
}));

// config is read at construction time; give it the two Azure vars so the client builds.
vi.mock('@/config/index.js', () => ({
    config: {
        AZURE_DOC_INTELLIGENCE_ENDPOINT: 'https://example.cognitiveservices.azure.com',
        AZURE_DOC_INTELLIGENCE_KEY: 'test-key',
    },
}));

// fs/promises.readFile is called with the temp path; return fixed base64, never touch disk.
vi.mock('fs/promises', () => ({ readFile: vi.fn(async () => 'ZmFrZQ==') }));

const load = () => import('./azure-doc-intelligence.ocr.js');

/** Build an analyzeResult with the given per-page word confidences. */
function analyzeResult(pagesWords: Array<Array<number | null | undefined>>, content?: string) {
    return {
        content: content ?? '',
        pages: pagesWords.map((words, i) => ({
            pageNumber: i + 1,
            words: words.map((confidence) => ({ content: 'w', confidence })),
            lines: [{ content: `page ${i + 1} line` }],
        })),
    };
}

const succeeded = (result: unknown) => ({ status: 'succeeded', analyzeResult: result });

beforeEach(() => {
    h.postResult = { status: 202 };
    h.unexpected = false;
    h.pollerBody = null;
    h.pollerThrows = null;
    h.pollerDelayMs = 0;
    vi.restoreAllMocks();
});

describe('AzureDocumentIntelligenceOcrProvider.extractText', () => {
    it('returns joined content and a mean confidence for a single page', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.pollerBody = succeeded(analyzeResult([[0.9, 0.8, 1.0]], 'Hello world'));

        const result = await new AzureDocumentIntelligenceOcrProvider().extractText('/tmp/x.png');

        expect(result.text).toBe('Hello world');
        expect(result.confidence).toBeCloseTo(0.9, 6);
        expect(result.pages).toBe(1);
    });

    it('concatenates text and aggregates one confidence across a multi-page PDF', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        // No top-level content → falls back to joining page lines; confidence is the mean of
        // ALL words across both pages: mean(0.6, 0.8, 0.4, 0.6) = 0.6.
        h.pollerBody = succeeded(analyzeResult([[0.6, 0.8], [0.4, 0.6]]));

        const result = await new AzureDocumentIntelligenceOcrProvider().extractText('/tmp/x.pdf');

        expect(result.text).toBe('page 1 line\n\npage 2 line');
        expect(result.confidence).toBeCloseTo(0.6, 6);
        expect(result.pages).toBe(2);
    });

    it('still returns a low-confidence result rather than rejecting it', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.pollerBody = succeeded(analyzeResult([[0.4, 0.5, 0.3]], 'blurry'));

        const result = await new AzureDocumentIntelligenceOcrProvider().extractText('/tmp/x.jpg');

        expect(result.confidence).not.toBeNull();
        expect(result.confidence!).toBeLessThan(OCR_MIN_CONFIDENCE);
        expect(result.text).toBe('blurry');
    });

    it('returns null confidence (unknown, not low) when no word confidence is usable', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.pollerBody = succeeded(analyzeResult([[0, undefined, null, 1.5]], 'text'));

        const result = await new AzureDocumentIntelligenceOcrProvider().extractText('/tmp/x.png');

        expect(result.confidence).toBeNull();
        expect(result.text).toBe('text');
    });

    it('maps a 429 so the worker RATE_LIMIT branch fires (message contains 429)', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.unexpected = true;
        h.postResult = { status: 429, body: { error: { code: '429', message: 'Too many requests' } } };

        const err = await new AzureDocumentIntelligenceOcrProvider()
            .extractText('/tmp/x.png')
            .catch((e) => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.message).toContain('429'); // the worker checks error.message.includes('429')
    });

    it('fails cleanly on a stuck LRO instead of hanging', async () => {
        vi.useFakeTimers();
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.pollerDelayMs = 10 * 60_000; // longer than the 110s poll timeout
        h.pollerBody = succeeded(analyzeResult([[0.9]]));

        const promise = new AzureDocumentIntelligenceOcrProvider()
            .extractText('/tmp/x.pdf')
            .catch((e) => e);
        await vi.advanceTimersByTimeAsync(111_000);
        const err = await promise;
        vi.useRealTimers();

        expect(err).toBeInstanceOf(AppError);
        expect(err.message).toContain('timed out');
    });

    it('surfaces a generic message and does not leak the raw Azure error body', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.unexpected = true;
        h.postResult = {
            status: 500,
            body: { error: { code: 'InternalServerError', message: 'secret endpoint 10.0.0.1 project foo' } },
        };

        const err = await new AzureDocumentIntelligenceOcrProvider()
            .extractText('/tmp/x.png')
            .catch((e) => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.message).toBe('OCR extraction failed'); // generic, no raw body
        expect(err.message).not.toContain('10.0.0.1');
        // The raw error is retained server-side only, in details.
        expect(err.details).toMatchObject({ code: 'InternalServerError' });
    });

    it('maps a failed operation body to a mapped AppError', async () => {
        const { AzureDocumentIntelligenceOcrProvider } = await load();
        h.pollerBody = { status: 'failed', error: { code: 'InvalidImage', message: 'bad' } };

        const err = await new AzureDocumentIntelligenceOcrProvider()
            .extractText('/tmp/x.png')
            .catch((e) => e);

        expect(err).toBeInstanceOf(AppError);
        expect(err.message).toBe('OCR extraction failed');
    });
});

describe('deriveAzureConfidence', () => {
    it('averages every usable word across all pages', async () => {
        const { deriveAzureConfidence } = await load();
        expect(deriveAzureConfidence(analyzeResult([[0.8, 1.0], [0.6]]))).toBeCloseTo(0.8, 6);
    });

    it('returns null when nothing is usable, never a default number', async () => {
        const { deriveAzureConfidence } = await load();
        expect(deriveAzureConfidence(analyzeResult([[0, -1, 2, NaN]]))).toBeNull();
        expect(deriveAzureConfidence(analyzeResult([[0, -1, 2, NaN]]))).not.toBe(0.85);
    });

    it('returns null for an empty or missing result', async () => {
        const { deriveAzureConfidence } = await load();
        expect(deriveAzureConfidence(undefined)).toBeNull();
        expect(deriveAzureConfidence(analyzeResult([]))).toBeNull();
    });
});

describe('joinAzureText', () => {
    it('prefers top-level content when present', async () => {
        const { joinAzureText } = await load();
        expect(joinAzureText(analyzeResult([[0.9]], '  full text  '))).toBe('full text');
    });

    it('falls back to joining page lines in order when content is empty', async () => {
        const { joinAzureText } = await load();
        expect(joinAzureText(analyzeResult([[0.9], [0.9]]))).toBe('page 1 line\n\npage 2 line');
    });

    it('returns empty string for a missing result', async () => {
        const { joinAzureText } = await load();
        expect(joinAzureText(undefined)).toBe('');
    });
});
