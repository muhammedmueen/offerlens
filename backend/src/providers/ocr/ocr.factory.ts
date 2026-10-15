import { config } from '@/config/index.js';
import { OcrProvider } from './ocr.provider.js';
import { GoogleVisionOcrProvider } from './google-vision.ocr.js';
import { AzureDocumentIntelligenceOcrProvider } from './azure-doc-intelligence.ocr.js';
import { MockOcrProvider } from './mock.ocr.js';

/**
 * Build the OCR provider from `OCR_PROVIDER` + its credentials.
 *
 * One factory, called from both selection sites (`plugins/providers.ts` for the sync
 * /offers/extract-file route and `workers/ocr.worker.ts` for the async upload path), so the
 * selection ternary is not duplicated. Mirrors `ai.factory.ts`'s "fall back to mock with a loud
 * warning when the key is missing" discipline: a provider named without credentials becomes the
 * mock, whose name is `'mock'`, so the production `OCR_UNAVAILABLE` guard still refuses rather
 * than letting a half-configured deployment fabricate OCR text.
 *
 * Default is `mock`, so local/dev and the test suite are unaffected.
 */
export function createOcrProvider(): OcrProvider {
    switch (config.OCR_PROVIDER) {
        case 'azure':
            if (config.AZURE_DOC_INTELLIGENCE_ENDPOINT && config.AZURE_DOC_INTELLIGENCE_KEY) {
                return new AzureDocumentIntelligenceOcrProvider();
            }
            console.warn(
                '[OCR] OCR_PROVIDER=azure but AZURE_DOC_INTELLIGENCE_ENDPOINT/_KEY are missing — '
                + 'using MockOcrProvider. Image and scanned-PDF uploads are refused in production.',
            );
            return new MockOcrProvider();
        case 'google':
            if (config.GOOGLE_CLOUD_CREDENTIALS) {
                return new GoogleVisionOcrProvider();
            }
            console.warn(
                '[OCR] OCR_PROVIDER=google but GOOGLE_CLOUD_CREDENTIALS is missing — '
                + 'using MockOcrProvider. Image uploads are refused in production.',
            );
            return new MockOcrProvider();
        case 'mock':
        default:
            return new MockOcrProvider();
    }
}
