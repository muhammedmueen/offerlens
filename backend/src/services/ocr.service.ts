import { logger } from '../utils/logger';

export interface TextExtractionResult {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
}

export class OCRService {
  /**
   * Extract text from PDF buffer
   * @param buffer - PDF file buffer
   * @returns Extracted text
   */
  async extractFromPDF(buffer: Buffer): Promise<string> {
    try {
      logger.info('Starting PDF text extraction');

      // Use require for better CommonJS compatibility with pdf-parse
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const pdfParse = require('pdf-parse');

      logger.info(`[OCR] pdf-parse loaded. Type=${typeof pdfParse}`);

      if (typeof pdfParse !== 'function') {
        logger.error(`[OCR] pdf-parse is not a function: ${typeof pdfParse}`);
        throw new Error('pdf-parse library not loaded correctly');
      }

      logger.info(`[OCR] Buffer size: ${buffer.length}`);

      // Extract text from PDF buffer
      const data = await pdfParse(buffer);

      if (!data.text || data.text.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }

      logger.info(`PDF text extraction successful, extracted ${data.text.length} characters`);
      return data.text;
    } catch (error) {
      logger.error('PDF text extraction failed', { error });
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Preprocess image for better OCR accuracy
   * @param buffer - Image file buffer
   * @returns Preprocessed image buffer
   */
  private async preprocessImage(buffer: Buffer): Promise<Buffer> {
    try {
      const sharp = (await import('sharp')).default;

      // Preprocess image: convert to grayscale, increase contrast, and resize
      const processedBuffer = await sharp(buffer)
        .grayscale()
        .normalize()
        .sharpen()
        .toBuffer();

      logger.info('Image preprocessing completed');
      return processedBuffer;
    } catch (error) {
      logger.error('Image preprocessing failed', { error });
      throw new Error(`Failed to preprocess image: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Extract text from image buffer using OCR
   * @param buffer - Image file buffer
   * @returns Extraction result with confidence score
   */
  async extractFromImage(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      logger.info('Starting image OCR extraction');

      // Preprocess the image
      const preprocessedBuffer = await this.preprocessImage(buffer);

      // Perform OCR using Tesseract.js
      const Tesseract = (await import('tesseract.js')).default;
      const worker = await Tesseract.createWorker('eng');

      const { data } = await worker.recognize(preprocessedBuffer);
      await worker.terminate();

      const text = data.text.trim();
      const confidence = data.confidence / 100; // Convert to 0-1 scale

      if (!text || text.length === 0) {
        logger.warn('No text extracted from image');
        return {
          text: '',
          confidence: 0,
          success: false,
          error: 'No text content found in image'
        };
      }

      logger.info(`Image OCR extraction successful, extracted ${text.length} characters with ${(confidence * 100).toFixed(2)}% confidence`);

      return {
        text,
        confidence,
        success: true
      };
    } catch (error) {
      logger.error('Image OCR extraction failed', { error });
      return {
        text: '',
        confidence: 0,
        success: false,
        error: `Failed to extract text from image: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}
