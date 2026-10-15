export interface OcrResult {
    text: string;
    /**
     * Text-recognition confidence, 0-1, or `null` when the provider did not report one.
     *
     * Nullable on purpose (task 21d). `GoogleVisionOcrProvider` used to substitute `0.85` for a
     * missing value, so a provider that reported nothing looked 85% sure — and since the number
     * was always present and always above the threshold, the confidence gate could never fire on
     * a real document. A null says "unknown", which the pipeline must treat as neither good nor
     * bad rather than as a passing grade.
     */
    confidence: number | null;
    /**
     * How many pages the provider processed, when it reports one. Optional and advisory: it
     * exists only so the usage ledger can bill per page for providers that charge that way
     * (Azure Read). Providers that bill per image/request (Google Vision, the mock) leave it
     * undefined, and the ledger falls back to one unit.
     */
    pages?: number;
}

export interface OcrProvider {
    /** Which backend this is, so the usage ledger can price and attribute an OCR call. */
    readonly name: 'google-vision' | 'azure-doc-intelligence' | 'mock';
    extractText(filePath: string): Promise<OcrResult>;
}
