import { Router } from 'express';
import { adminController } from '../controllers/admin.controller';
import { authenticateAdmin } from '../middleware/auth';

const router = Router();

/**
 * Admin Routes
 * All routes except /login require JWT authentication
 */

// Public route - no authentication required
router.post('/admin/login', (req, res) => adminController.login(req, res));

// Protected routes - authentication required
router.post('/admin/salary-benchmarks', authenticateAdmin, (req, res) =>
  adminController.createSalaryBenchmark(req, res)
);

router.put('/admin/salary-benchmarks/:id', authenticateAdmin, (req, res) =>
  adminController.updateSalaryBenchmark(req, res)
);

router.post('/admin/salary-benchmarks/import', authenticateAdmin, (req, res) =>
  adminController.importSalaryBenchmarks(req, res)
);

router.post('/admin/red-flag-rules', authenticateAdmin, (req, res) =>
  adminController.createRedFlagRule(req, res)
);

router.put('/admin/red-flag-rules/:id', authenticateAdmin, (req, res) =>
  adminController.updateRedFlagRule(req, res)
);

router.put('/admin/feature-requests/:id/status', authenticateAdmin, (req, res) =>
  adminController.updateFeatureRequestStatus(req, res)
);

export default router;
