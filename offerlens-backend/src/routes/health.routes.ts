import { Router } from 'express';
import { livenessProbe, readinessProbe } from '../controllers/health.controller';

const router = Router();

/**
 * Health Check Routes
 * Requirements: 8.3
 */

// Liveness probe - checks if app is running
router.get('/health', livenessProbe);

// Readiness probe - checks if app is ready to serve traffic
router.get('/health/ready', readinessProbe);

export default router;
