import { Router } from 'express';
import {
  validate,
  analysisRateLimiter,
  readOnlyRateLimiter,
  authRateLimiter,
  strictSanitizeInput,
} from '../middleware';
import {
  analyzeRequestSchema,
  featureRequestSchema,
  featureRequestQuerySchema,
  adminLoginSchema,
} from '../schemas';

/**
 * Example routes demonstrating middleware usage
 * This file shows how to use validation, rate limiting, and sanitization
 */

const router = Router();

// Example: Analysis endpoint with strict rate limiting and validation
router.post(
  '/analyze',
  analysisRateLimiter, // 5 requests per minute
  strictSanitizeInput, // Strict sanitization for text content
  validate(analyzeRequestSchema), // Validate request body
  async (_req, res) => {
    // Handler implementation
    res.json({ message: 'Analysis endpoint' });
  }
);

// Example: Feature request endpoint with standard rate limiting
router.post(
  '/feature-requests',
  validate(featureRequestSchema),
  async (_req, res) => {
    // Handler implementation
    res.json({ message: 'Feature request created' });
  }
);

// Example: Read-only endpoint with lenient rate limiting
router.get(
  '/feature-requests',
  readOnlyRateLimiter, // 100 requests per minute
  validate(featureRequestQuerySchema, 'query'), // Validate query params
  async (_req, res) => {
    // Handler implementation
    res.json({ message: 'Feature requests list' });
  }
);

// Example: Admin login with strict rate limiting
router.post(
  '/admin/login',
  authRateLimiter, // 5 attempts per 15 minutes
  validate(adminLoginSchema),
  async (_req, res) => {
    // Handler implementation
    res.json({ message: 'Admin login' });
  }
);

// Example: Health check (no rate limiting or validation)
router.get('/health', async (_req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

export default router;
