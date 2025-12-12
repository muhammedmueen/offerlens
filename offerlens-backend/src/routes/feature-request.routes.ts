import { Router } from 'express';
import {
  createFeatureRequest,
  listFeatureRequests,
  getFeatureRequest,
  voteFeatureRequest,
} from '../controllers/feature-request.controller';
import { validate } from '../middleware/validation';
import { rateLimiter } from '../middleware/rateLimiter';
import {
  featureRequestSchema,
  featureRequestQuerySchema,
  uuidParamSchema,
} from '../schemas';

const router = Router();

/**
 * Feature Request Routes
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 14.2, 14.3
 */

/**
 * POST /api/v1/feature-requests
 * Submit a new feature request
 * - Rate limited: 5 requests per hour per IP
 * - Validates request body
 */
router.post(
  '/feature-requests',
  rateLimiter({ windowMs: 3600000, maxRequests: 5 }), // 5 requests per hour
  validate(featureRequestSchema, 'body'),
  createFeatureRequest
);

/**
 * GET /api/v1/feature-requests
 * List feature requests with optional filtering and pagination
 * - Rate limited: 30 requests per minute
 * - Validates query parameters
 */
router.get(
  '/feature-requests',
  rateLimiter({ windowMs: 60000, maxRequests: 30 }), // 30 requests per minute
  validate(featureRequestQuerySchema, 'query'),
  listFeatureRequests
);

/**
 * GET /api/v1/feature-requests/:id
 * Get a single feature request by ID
 * - Rate limited: 30 requests per minute
 * - Validates ID parameter
 */
router.get(
  '/feature-requests/:id',
  rateLimiter({ windowMs: 60000, maxRequests: 30 }), // 30 requests per minute
  validate(uuidParamSchema, 'params'),
  getFeatureRequest
);

/**
 * POST /api/v1/feature-requests/:id/vote
 * Vote for a feature request
 * - Rate limited: 10 requests per hour per IP
 * - Validates ID parameter
 */
router.post(
  '/feature-requests/:id/vote',
  rateLimiter({ windowMs: 3600000, maxRequests: 10 }), // 10 requests per hour
  validate(uuidParamSchema, 'params'),
  voteFeatureRequest
);

export default router;

