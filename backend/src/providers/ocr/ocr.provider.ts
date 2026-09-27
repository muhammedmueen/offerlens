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
}

export interface OcrProvider {
    extractText(filePath: string): Promise<OcrResult>;
}
