import { readFile } from 'fs/promises';
import DocumentIntelligence, {
    getLongRunningPoller,
    isUnexpected,
    type AnalyzeOperationOutput,
    type DocumentIntelligenceClient,
} from '@azure-rest/ai-document-intelligence';

/**
 * The structural subset of `analyzeResult` the text/confidence mappers actually read.
 *
 * Narrower than the SDK's `AnalyzeResultOutput` on purpose: it keeps the mappers (and their
 * tests) free of the many required SDK fields they never touch, while still being satisfied by a
 * real `AnalyzeResultOutput`. All SDK-specific types stay confined to this one file.
 */
export interface AzureReadResult {
    content?: string;
    pages?: Array<{
        words?: Array<{ confidence?: number | null }>;
        lines?: Array<{ content: string }>;
    }>;
}
import { OcrProvider, OcrResult } from './ocr.provider.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { config } from '@/config/index.js';

/**
 * How long to wait for the async analyze LRO before giving up.
 *
 * ponytail: a fixed ceiling, not a tuned one. 110s sits just under the OCR worker's 120s
 * `lockDuration` so a stuck analyze fails cleanly inside the lock rather than losing it and
 * being re-queued mid-flight. A one-page letter returns in a second or two; this only fires on
 * a genuinely stuck operation. Upgrade path: make it an env var if real multi-page scans ever
 * run long enough to need tuning.
 */
const POLL_TIMEOUT_MS = 110_000;

/** The `prebuilt-read` OCR foundation model: lines, words, languages. Accepts PDF and images. */
const READ_MODEL_ID = 'prebuilt-read';

/** A usable 0-1 reading. Mirrors the Google provider: anything outside (0,1] is "not computed". */
function usable(value: number | null | undefined): value is number {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
}

const mean = (values: number[]): number | null =>
    values.length === 0 ? null : values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Join the recognised text for the document.
 *
 * `analyzeResult.content` is the service's own reading-order concatenation of every page, so it
 * is preferred when present. The per-line fallback exists only for a response shape that somehow
 * carries pages but no top-level content — concatenating lines with `\n` and pages with `\n\n`
 * keeps multi-page order. Trimmed, because the downstream `MIN_EXTRACTED_TEXT_CHARS` gate counts
 * trimmed length.
 */
export function joinAzureText(result: AzureReadResult | undefined): string {
    if (!result) return '';
    if (typeof result.content === 'string' && result.content.trim().length > 0) {
        return result.content.trim();
    }
    const pages = (result.pages ?? []).map((page) =>
        (page.lines ?? []).map((line) => line.content).join('\n'),
    );
    return pages.join('\n\n').trim();
}

/**
 * Derive one document confidence, or null when the response carries none usable.
 *
 * Azure Read reports confidence per WORD (`pages[].words[].confidence`), not a single document
 * figure, and the field is not guaranteed meaningful on every token. This mirrors the Google
 * provider's `deriveConfidence` philosophy exactly: average every usable per-word reading across
 * ALL pages into one document figure comparable to `OCR_MIN_CONFIDENCE = 0.6`, and return `null`
 * — never a default number — when none are usable. `null` means "unknown", which the gate must
 * treat as neither pass nor fail. Substituting a default here is the `|| 0.85` bug the Google
 * provider was rewritten to kill; it must not come back.
 */
export function deriveAzureConfidence(result: AzureReadResult | undefined): number | null {
    if (!result?.pages) return null;
    const words: number[] = [];
    for (const page of result.pages) {
        for (const word of page.words ?? []) {
            if (usable(word.confidence)) words.push(word.confidence);
        }
    }
    return mean(words);
}

export class AzureDocumentIntelligenceOcrProvider implements OcrProvider {
    readonly name = 'azure-doc-intelligence' as const;
    private client: DocumentIntelligenceClient;

    constructor() {
        // The factory only builds this provider once the endpoint and key are present, so the
        // non-null assertions are safe. The key never leaves this constructor; it is not logged.
        this.client = DocumentIntelligence(
            config.AZURE_DOC_INTELLIGENCE_ENDPOINT!,
            { key: config.AZURE_DOC_INTELLIGENCE_KEY! },
        );
    }

    async extractText(filePath: string): Promise<OcrResult> {
        try {
            // The provider only READS the file. Both callers own and purge the temp file
            // (offer.service.ts finally-unlink, ocr.worker.ts runThenPurgeFile), so nothing is
            // moved or deleted here.
            const base64Source = await readFile(filePath, { encoding: 'base64' });

            const initial = await this.client
                .path('/documentModels/{modelId}:analyze', READ_MODEL_ID)
                .post({ contentType: 'application/json', body: { base64Source } });

            if (isUnexpected(initial)) {
                throw azureError(initial.body?.error);
            }

            const poller = getLongRunningPoller(this.client, initial);
            const output = (await withTimeout(poller.pollUntilDone(), POLL_TIMEOUT_MS))
                .body as AnalyzeOperationOutput;

            if (output.status === 'failed') {
                throw azureError(output.error);
            }

            const analyzeResult = output.analyzeResult;
            return {
                text: joinAzureText(analyzeResult),
                confidence: deriveAzureConfidence(analyzeResult),
                pages: analyzeResult?.pages?.length,
            };
        } catch (error) {
            // Already classified (timeout, mapped Azure error) — rethrow untouched so the
            // worker's 429/retry detection sees the message we set.
            if (error instanceof AppError) throw error;
            // Anything else (file read, network) becomes the generic server error. The raw cause
            // is kept server-side only; it is never serialised to the client.
            throw new AppError(ERROR_CODES.INTERNAL_ERROR, 'OCR extraction failed', 500, error);
        }
    }
}

/**
 * Map an Azure error (initial-response or failed-operation body) to a generic AppError.
 *
 * The raw Azure error — which can carry the resource endpoint and request ids — stays in `cause`
 * (server log only) and is never put in the client-facing message. A 429/throttle keeps '429' in
 * the message so the OCR worker's existing `error.message.includes('429')` branch classifies it
 * as a non-terminal RATE_LIMIT and lets BullMQ retry.
 */
function azureError(err: { code?: string; message?: string } | undefined): AppError {
    const code = err?.code ?? '';
    const isThrottle = code === '429' || /throttl|rate limit|too many requests/i.test(err?.message ?? '');
    const message = isThrottle ? 'OCR extraction failed (429 rate limit)' : 'OCR extraction failed';
    return new AppError(ERROR_CODES.INTERNAL_ERROR, message, isThrottle ? 429 : 500, err);
}

/** Reject with a clean AppError if a promise does not settle within `ms`, so an LRO cannot hang. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
        timer = setTimeout(
            () => reject(new AppError(ERROR_CODES.INTERNAL_ERROR, 'OCR extraction timed out', 504)),
            ms,
        );
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
