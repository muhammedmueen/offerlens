import { Router } from 'express';
import { getRoles, getExperienceLevels, getCities } from '../controllers/metadata.controller';

const router = Router();

/**
 * Metadata Routes
 * Provides access to system metadata like roles, experience levels, and cities
 * 
 * Requirements: 5.1 - Provide metadata endpoints for salary benchmarks
 */

// GET /api/v1/roles - Get all available roles
router.get('/roles', getRoles);

// GET /api/v1/experience-levels - Get all available experience levels
router.get('/experience-levels', getExperienceLevels);

// GET /api/v1/cities - Get all available cities
router.get('/cities', getCities);

export default router;
