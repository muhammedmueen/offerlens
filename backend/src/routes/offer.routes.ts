import { Router } from "express";
import multer from "multer";
import { offerController } from "../controllers/offer.controller";

const router = Router();

// Configure multer for file uploads (memory storage for processing)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (_req, file, cb) => {
        const allowedMimes = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
        if (allowedMimes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only PDF and images are allowed."));
        }
    },
});

/**
 * Offer Routes
 *
 * POST   /api/offers         - Upload offer letter for analysis
 * GET    /api/offers/:id     - Get offer analysis status/results
 * PATCH  /api/offers/:id/corrections - Submit user corrections (RLHF)
 */

router.post("/", upload.single("file"), (req, res) => offerController.uploadOffer(req, res));
router.get("/:id", (req, res) => offerController.getOffer(req, res));
router.patch("/:id/corrections", (req, res) => offerController.submitCorrections(req, res));

export default router;
