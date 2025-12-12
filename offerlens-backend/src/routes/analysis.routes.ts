import { Router } from 'express';
import { analyzeOffer } from '../controllers/analysis.controller';
import { validate } from '../middleware/validation';
import { rateLimiter } from '../middleware/rateLimiter';
import { analyzeRequestSchema } from '../schemas';

const router = Router();

/**
 * Analysis Routes
 * Requirements: 1.1, 1.2, 1.3, 6.1
 */

/**
 * POST /api/v1/analyze
 * Analyze an offer letter
 * - Rate limited: 10 requests per minute
 * - Validates request body
 * - Returns analysis results without persisting offer data
 */
router.post(
  '/analyze',
  rateLimiter({ windowMs: 60000, maxRequests: 10 }), // 10 requests per minute
  validate(analyzeRequestSchema, 'body'),
  analyzeOffer
);

export default router;
