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
    let parser: any = null;
    try {
      logger.info('Starting PDF text extraction');
      
      // Import PDFParse class from pdf-parse
      // @ts-ignore - pdf-parse has complex module exports
      const { PDFParse } = await import('pdf-parse');
      
      // Create parser with buffer as data source
      parser = new PDFParse({ data: buffer });
      
      // Extract text from PDF
      const result = await parser.getText();
      
      if (!result.text || result.text.trim().length === 0) {
        throw new Error('No text content found in PDF');
      }
      
      logger.info(`PDF text extraction successful, extracted ${result.text.length} characters`);
      return result.text;
    } catch (error) {
      logger.error('PDF text extraction failed', { error });
      throw new Error(`Failed to extract text from PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      // Clean up parser resources
      if (parser && typeof parser.destroy === 'function') {
        try {
          await parser.destroy();
        } catch (cleanupError) {
          logger.warn('Failed to cleanup PDF parser', { cleanupError });
        }
      }
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
