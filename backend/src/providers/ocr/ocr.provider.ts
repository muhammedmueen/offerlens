export interface OcrResult {
    text: string;
    confidence: number;
}

export interface OcrProvider {
    extractText(filePath: string): Promise<OcrResult>;
}
