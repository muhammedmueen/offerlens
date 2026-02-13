import { OcrProvider, OcrResult } from './ocr.provider.js';
import vision from '@google-cloud/vision';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

import { config } from '@/config/index.js';

export class GoogleVisionOcrProvider implements OcrProvider {
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
                return { text: '', confidence: 0 };
            }

            // Full text is the first annotation
            const fullText = detections[0].description || '';

            // Calculate confidence from individual blocks (Google Vision doesn't give overall confidence for full text)
            // This is an approximation based on page confidence if available, or just mocking high confidence if text exists
            // Real implementation would parse fullTextAnnotation.pages[0].confidence

            const confidence = result.fullTextAnnotation?.pages?.[0]?.confidence || 0.85;

            return {
                text: fullText,
                confidence,
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
