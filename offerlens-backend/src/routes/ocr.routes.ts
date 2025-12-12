import { Router } from 'express';
import { extractText, upload } from '../controllers/ocr.controller';

const router = Router();

/**
 * POST /api/v1/extract-text
 * Extract text from uploaded file (PDF, image, or text)
 */
router.post('/extract-text', upload.single('file'), extractText);

export default router;
