import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { enqueueAnalysisJob } from "../lib/queue";
import { logger } from "../utils/logger";
import { OCRService } from "../services/ocr.service";

const prisma = new PrismaClient();
const ocrService = new OCRService();

/**
 * Offer Controller - Handles async offer uploads
 * Flow: Upload -> Create Offer -> Enqueue Job -> Return 202
 */
export class OfferController {
    /**
     * POST /api/offers
     * Upload an offer letter PDF for analysis
     */
    async uploadOffer(req: Request, res: Response) {
        try {
            const file = req.file;
            const { email } = req.body;

            if (!file) {
                return res.status(400).json({ error: "No file uploaded" });
            }

            logger.info(`[Offer] Received upload: ${file.originalname} (${file.size} bytes)`);

            // Step 1: Extract text immediately (fast for PDFs)
            let extractedText: string;
            try {
                if (file.mimetype === "application/pdf") {
                    extractedText = await ocrService.extractFromPDF(file.buffer);
                } else if (file.mimetype.startsWith("image/")) {
                    const result = await ocrService.extractFromImage(file.buffer);
                    if (!result.success) {
                        return res.status(400).json({ error: result.error || "Failed to extract text from image" });
                    }
                    extractedText = result.text;
                } else {
                    return res.status(400).json({ error: "Unsupported file type. Please upload PDF or image." });
                }
            } catch (extractError) {
                logger.error("[Offer] Text extraction failed", { error: extractError });
                return res.status(400).json({ error: "Failed to extract text from file" });
            }

            logger.info(`[Offer] Extracted text length: ${extractedText?.length}`);

            // Step 2: Create or find user (if email provided)
            let userId: string | null = null;
            if (email) {
                const user = await prisma.user.upsert({
                    where: { email },
                    create: { email },
                    update: {},
                });
                userId = user.id;
            }

            // Step 3: Create Offer record
            const offer = await prisma.offer.create({
                data: {
                    userId,
                    status: "processing",
                    fileUrl: null, // TODO: Store in S3 if needed
                },
            });

            logger.info(`[Offer] Created offer ${offer.id}, queuing for analysis`);

            // Step 4: Enqueue analysis job (async processing)
            await enqueueAnalysisJob({
                type: "EXTRACT_OFFER",
                offerId: offer.id,
                fileUrl: extractedText, // Passing text directly for now (could be S3 URL)
            });

            // Step 5: Return 202 Accepted (async processing)
            return res.status(202).json({
                message: "Offer uploaded successfully. Analysis in progress.",
                offerId: offer.id,
                status: "processing",
            });
        } catch (error) {
            logger.error("[Offer] Upload failed", { error });
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    /**
     * GET /api/offers/:id
     * Get offer analysis status and results
     */
    async getOffer(req: Request, res: Response) {
        try {
            const { id } = req.params;

            const offer = await prisma.offer.findUnique({
                where: { id },
                include: { user: { select: { email: true } } },
            });

            if (!offer) {
                return res.status(404).json({ error: "Offer not found" });
            }

            return res.json({
                id: offer.id,
                status: offer.status,
                extractedData: offer.extractedData,
                redFlagsResult: offer.redFlagsResult,
                marketComparison: offer.marketComparison,
                createdAt: offer.createdAt,
                updatedAt: offer.updatedAt,
            });
        } catch (error) {
            logger.error("[Offer] Get offer failed", { error });
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    /**
     * POST /api/offers/:id/analyze
     * Update offer details and re-trigger analysis
     */
    async reanalyzeOffer(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { role, location, ctc, offerText, baseSalary } = req.body;

            const offer = await prisma.offer.findUnique({ where: { id } });
            if (!offer) {
                return res.status(404).json({ error: "Offer not found" });
            }

            // Update extractedData with user provided values
            const currentData = (offer.extractedData as Record<string, any>) || {};
            const updatedData = {
                ...currentData,
                jobTitle: role || currentData.jobTitle,
                location: location || currentData.location,
                baseSalary: baseSalary || ctc || currentData.baseSalary, // Handle ctc/baseSalary
                rawText: offerText || currentData.rawText,
                // Add experience if needed in extractedData schema, checking extraction.service
            };

            await prisma.offer.update({
                where: { id },
                data: {
                    extractedData: updatedData,
                    status: "processing", // Set back to processing
                },
            });

            // Re-queue RED FLAGS detection (which chains to Market Data)
            // We pass the potentially updated text and Offer ID
            await enqueueAnalysisJob({
                type: "DETECT_RED_FLAGS",
                offerId: id,
                extractedText: updatedData.rawText || "",
            });

            // Also explicitly queue Market Data if role/loc updated? 
            // The worker queues it automatically if fields exist. 
            // But we might want to force it if only salary changed.
            // For now, let the chain handle it.

            return res.json({
                message: "Analysis re-triggered with updated details",
                offerId: id,
                status: "processing",
            });

        } catch (error) {
            logger.error("[Offer] Re-analyze failed", { error });
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    /**
     * PATCH /api/offers/:id/corrections
     * Store user corrections for RLHF training data
     */
    async submitCorrections(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { corrections } = req.body;

            if (!corrections || typeof corrections !== "object") {
                return res.status(400).json({ error: "Invalid corrections data" });
            }

            const offer = await prisma.offer.update({
                where: { id },
                data: {
                    userCorrections: corrections,
                },
            });

            logger.info(`[Offer] Corrections stored for offer ${id} (RLHF data)`);

            return res.json({
                message: "Corrections saved successfully",
                offerId: offer.id,
            });
        } catch (error) {
            logger.error("[Offer] Submit corrections failed", { error });
            return res.status(500).json({ error: "Internal server error" });
        }
    }

    /**
     * POST /api/offers/:id/negotiate
     * Generate negotiation script and send via email
     */
    async negotiateOffer(req: Request, res: Response) {
        try {
            const { id } = req.params;
            const { email } = req.body;

            if (!email) {
                return res.status(400).json({ error: "Email is required" });
            }

            // Get offer data
            const offer = await prisma.offer.findUnique({
                where: { id },
                include: { user: true },
            });

            if (!offer || !offer.extractedData || !offer.marketComparison) {
                return res.status(404).json({ error: "Offer not found or analysis incomplete" });
            }

            // Update user email if not set or provided
            if (email) {
                await prisma.user.upsert({
                    where: { email },
                    create: { email },
                    update: {},
                });

                // Link offer to user if not linked
                if (!offer.userId) {
                    const user = await prisma.user.findUnique({ where: { email } });
                    if (user) {
                        await prisma.offer.update({
                            where: { id },
                            data: { userId: user.id },
                        });
                    }
                }
            }

            // Import dynamically to avoid circular dependency issues if any
            const { negotiationService } = await import("../services/negotiation.service");

            // Analyze leverage
            // @ts-ignore - JSON types vs Interface mismatch logic
            const leverage = negotiationService.analyzeLeverage(offer.marketComparison);

            // Prepare script
            // @ts-ignore - JSON types vs Interface mismatch logic
            const script = await negotiationService.prepareScript(id, leverage, offer.extractedData);

            if (!script) {
                return res.status(400).json({ error: "Could not generate script for this offer" });
            }

            // Send email
            const sent = await negotiationService.sendScriptEmail(email, id, script);

            if (!sent) {
                return res.status(500).json({ error: "Failed to send email. Please try again." });
            }

            return res.json({
                message: "Negotiation script sent to email",
                scriptTitle: script.title,
                success: true
            });

        } catch (error) {
            logger.error("[Offer] Negotiation failed", { error });
            return res.status(500).json({ error: "Internal server error" });
        }
    }
}

export const offerController = new OfferController();
