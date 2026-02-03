import { Request, Response } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { OCRService } from '../services/ocr.service';
import { logger } from '../utils/logger';

// Configure multer for memory storage
const storage = multer.memoryStorage();

// File filter to validate file types
const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  const allowedMimeTypes = [
    'application/pdf',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'text/plain'
  ];

  if (allowedMimeTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type. Allowed types: PDF, JPEG, PNG, TXT`));
  }
};

// Configure multer with size limit (10MB)
export const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB
  }
});

const ocrService = new OCRService();

/**
 * Extract text from uploaded file (PDF or image)
 * POST /api/v1/extract-text
 */
export const extractText = async (req: Request, res: Response): Promise<void> => {
  const requestId = uuidv4();
  
  try {
    if (!req.file) {
      res.status(400).json({
        error: {
          code: 'NO_FILE',
          message: 'No file uploaded',
          timestamp: new Date().toISOString(),
          requestId
        }
      });
      return;
    }

    const { buffer, mimetype, originalname } = req.file;
    
    logger.info('Processing file upload', {
      filename: originalname,
      mimetype,
      size: buffer.length
    });

    let text: string;
    let confidence = 1.0; // PDF extraction has 100% confidence

    // Route to appropriate extraction method based on file type
    if (mimetype === 'application/pdf') {
      text = await ocrService.extractFromPDF(buffer);
    } else if (mimetype.startsWith('image/')) {
      const result = await ocrService.extractFromImage(buffer);
      
      if (!result.success) {
        res.status(200).json({
          text: '',
          confidence: 0,
          success: false,
          error: result.error || 'Failed to extract text from image'
        });
        return;
      }
      
      text = result.text;
      confidence = result.confidence;
    } else if (mimetype === 'text/plain') {
      // For plain text files, just read the buffer
      text = buffer.toString('utf-8');
    } else {
      res.status(400).json({
        error: {
          code: 'UNSUPPORTED_FILE_TYPE',
          message: 'Unsupported file type',
          timestamp: new Date().toISOString(),
          requestId
        }
      });
      return;
    }

    // Check if extraction yielded any text
    if (!text || text.trim().length === 0) {
      res.status(200).json({
        text: '',
        confidence: 0,
        success: false,
        error: 'No text content found in the uploaded file'
      });
      return;
    }

    logger.info('Text extraction successful', {
      filename: originalname,
      textLength: text.length,
      confidence
    });

    res.status(200).json({
      text,
      confidence,
      success: true,
      metadata: {
        filename: originalname,
        fileType: mimetype,
        textLength: text.length
      }
    });
  } catch (error) {
    logger.error('Text extraction failed', { error });
    
    res.status(200).json({
      text: '',
      confidence: 0,
      success: false,
      error: error instanceof Error ? error.message : 'Failed to extract text from file'
    });
  }
};
