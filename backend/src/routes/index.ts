import { Router } from 'express';
import analysisRoutes from './analysis.routes';
import ocrRoutes from './ocr.routes';
import featureRequestRoutes from './feature-request.routes';
import adminRoutes from './admin.routes';
import healthRoutes from './health.routes';
import metadataRoutes from './metadata.routes';
import offerRoutes from './offer.routes';

const router = Router();

/**
 * API Routes
 * All routes are prefixed with /api/v1
 */

// Health check routes
router.use('/', healthRoutes);

// Offer routes (async upload & analysis)
router.use('/offers', offerRoutes);

// Analysis routes
router.use('/', analysisRoutes);

// OCR routes
router.use('/', ocrRoutes);

// Feature request routes
router.use('/', featureRequestRoutes);

// Admin routes
router.use('/', adminRoutes);

// Metadata routes
router.use('/', metadataRoutes);

export default router;

