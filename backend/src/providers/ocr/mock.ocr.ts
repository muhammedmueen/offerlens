import { OcrProvider, OcrResult } from './ocr.provider.js';

export class MockOcrProvider implements OcrProvider {
    async extractText(_filePath: string): Promise<OcrResult> {
        return {
            text: 'This is mock text extracted from the offer letter. Company: Mock Corp. Role: Software Engineer. Salary: 12,00,000 INR.',
            // No recognition happened, so there is nothing to be confident about. Returning a
            // number here would put a fabricated quality score on fixture text and make the
            // mock path indistinguishable from a real scan in the database.
            confidence: null,
        };
    }
}
