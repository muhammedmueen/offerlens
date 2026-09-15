import { OcrProvider, OcrResult } from './ocr.provider.js';

export class MockOcrProvider implements OcrProvider {
    async extractText(_filePath: string): Promise<OcrResult> {
        return {
            text: 'This is mock text extracted from the offer letter. Company: Mock Corp. Role: Software Engineer. Salary: 12,00,000 INR.',
            confidence: 0.99,
        };
    }
}
