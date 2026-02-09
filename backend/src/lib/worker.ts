import { Worker, Job } from "bullmq";
import { PrismaClient } from "@prisma/client";
import { AnalysisJobData, EmailJobData, redisConnection, enqueueAnalysisJob } from "./queue";
import { extractionService } from "../services/extraction.service";
import { analysisService } from "../services/analysis.service";

const prisma = new PrismaClient();

// --- Analysis Worker ---
const analysisWorker = new Worker<AnalysisJobData>(
    "analysis-queue",
    async (job: Job<AnalysisJobData>) => {
        console.log(`[Analysis Worker] Processing job: ${job.id} - ${job.name}`);
        const data = job.data;

        switch (data.type) {
            case "EXTRACT_OFFER": {
                console.log(`[Extraction] Processing offer: ${data.offerId}`);

                try {
                    // Step 1: Run hybrid extraction (Regex -> LLM fallback)
                    const result = await extractionService.extractOfferData(data.fileUrl);

                    // Step 2: Update offer with extracted data
                    await prisma.offer.update({
                        where: { id: data.offerId },
                        data: {
                            extractedData: result.data as object,
                            status: "extracted",
                        },
                    });

                    console.log(`[Extraction] Completed for ${data.offerId} via ${result.method}`);

                    // Step 3: Chain to red flag detection
                    await enqueueAnalysisJob({
                        type: "DETECT_RED_FLAGS",
                        offerId: data.offerId,
                        extractedText: result.data.rawText || data.fileUrl,
                    });
                } catch (error) {
                    console.error(`[Extraction] Failed for ${data.offerId}:`, error);
                    await prisma.offer.update({
                        where: { id: data.offerId },
                        data: { status: "failed" },
                    });
                }
                break;
            }

            case "DETECT_RED_FLAGS": {
                console.log(`[Red Flags] Scanning offer: ${data.offerId}`);

                try {
                    // Use existing analysis service for red flag detection
                    const redFlags = await analysisService.detectRedFlags(data.extractedText);

                    // Get offer for extracted data
                    const offer = await prisma.offer.findUnique({ where: { id: data.offerId } });
                    const extractedData = (offer?.extractedData as Record<string, unknown>) || {};

                    // Update offer with red flags
                    await prisma.offer.update({
                        where: { id: data.offerId },
                        data: {
                            redFlagsResult: redFlags as object[],
                            status: "analyzed",
                        },
                    });

                    console.log(`[Red Flags] Found ${redFlags.length} flags for ${data.offerId}`);

                    // Step 3: Chain to market data lookup if we have role/location
                    if (extractedData.jobTitle && extractedData.location) {
                        await enqueueAnalysisJob({
                            type: "LOOKUP_MARKET_DATA",
                            offerId: data.offerId,
                            role: String(extractedData.jobTitle),
                            location: String(extractedData.location),
                            yoe: 3, // Default, could be extracted later
                        });
                    } else {
                        // Mark as completed if no market data lookup
                        await prisma.offer.update({
                            where: { id: data.offerId },
                            data: { status: "completed" },
                        });
                    }
                } catch (error) {
                    console.error(`[Red Flags] Failed for ${data.offerId}:`, error);
                }
                break;
            }

            case "LOOKUP_MARKET_DATA": {
                console.log(`[Market Data] Looking up: ${data.role} in ${data.location}`);

                try {
                    const offer = await prisma.offer.findUnique({ where: { id: data.offerId } });
                    const extractedData = (offer?.extractedData as Record<string, unknown>) || {};
                    const salary = Number(extractedData.baseSalary) || 0;

                    // Use existing analysis service for salary comparison
                    const salaryComparison = await analysisService.compareSalary(
                        data.role,
                        `${data.yoe} years`,
                        salary,
                        data.location
                    );

                    // Update offer with market comparison
                    await prisma.offer.update({
                        where: { id: data.offerId },
                        data: {
                            marketComparison: salaryComparison as object,
                            status: "completed",
                        },
                    });

                    console.log(`[Market Data] Comparison complete for ${data.offerId}: ${salaryComparison.comparison}`);
                } catch (error) {
                    console.error(`[Market Data] Failed for ${data.offerId}:`, error);
                    // Still mark as completed - market data is optional
                    await prisma.offer.update({
                        where: { id: data.offerId },
                        data: { status: "completed" },
                    });
                }
                break;
            }

            default:
                console.warn(`[Analysis Worker] Unknown job type`);
        }
    },
    { connection: redisConnection }
);

// --- Email Worker ---
const emailWorker = new Worker<EmailJobData>(
    "email-queue",
    async (job: Job<EmailJobData>) => {
        console.log(`[Email Worker] Processing job: ${job.id} - ${job.name}`);
        const data = job.data;

        // Lazy import to avoid circular dependencies
        const { Resend } = await import("resend");
        const resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;

        switch (data.type) {
            case "SEND_NEGOTIATION_SCRIPT": {
                console.log(`[Email] Sending script to: ${data.email}`);

                if (!resend) {
                    console.warn("[Email] Resend not configured, skipping");
                    break;
                }

                try {
                    await resend.emails.send({
                        from: process.env.EMAIL_FROM || "noreply@offerlens.com",
                        to: data.email,
                        subject: "Your Negotiation Talking Points - OfferLens",
                        html: data.scriptContent,
                    });
                    console.log(`[Email] Script sent successfully to ${data.email}`);
                } catch (error) {
                    console.error(`[Email] Failed to send script:`, error);
                    throw error; // Retry via BullMQ
                }
                break;
            }

            case "SEND_FOLLOWUP_SURVEY": {
                console.log(`[Email] Sending survey to: ${data.email}`);

                if (!resend) {
                    console.warn("[Email] Resend not configured, skipping");
                    break;
                }

                try {
                    await resend.emails.send({
                        from: process.env.EMAIL_FROM || "noreply@offerlens.com",
                        to: data.email,
                        subject: "How did your negotiation go? - OfferLens",
                        html: `
                            <div style="font-family: system-ui, sans-serif; max-width: 600px; margin: 0 auto;">
                                <h1>We'd love to hear how it went! 🎯</h1>
                                <p>A week ago, we sent you negotiation tips for your job offer. We're curious:</p>
                                <ul>
                                    <li>Did you negotiate?</li>
                                    <li>What was the outcome?</li>
                                    <li>How can we improve our advice?</li>
                                </ul>
                                <p>Your feedback helps us refine our scripts for future users.</p>
                                <a href="https://offerlens.com/feedback/${data.offerId}" 
                                   style="display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none;">
                                    Share Your Outcome
                                </a>
                                <p style="color: #666; font-size: 12px; margin-top: 32px;">
                                    Offer ID: ${data.offerId}
                                </p>
                            </div>
                        `,
                    });
                    console.log(`[Email] Survey sent successfully to ${data.email}`);
                } catch (error) {
                    console.error(`[Email] Failed to send survey:`, error);
                    throw error;
                }
                break;
            }

            default:
                console.warn(`[Email Worker] Unknown job type`);
        }
    },
    { connection: redisConnection }
);

// --- Event Handlers ---
analysisWorker.on("completed", (job: Job) => {
    console.log(`[Analysis Worker] Job ${job.id} completed`);
});

analysisWorker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[Analysis Worker] Job ${job?.id} failed:`, err.message);
});

emailWorker.on("completed", (job: Job) => {
    console.log(`[Email Worker] Job ${job.id} completed`);
});

emailWorker.on("failed", (job: Job | undefined, err: Error) => {
    console.error(`[Email Worker] Job ${job?.id} failed:`, err.message);
});

// --- Graceful Shutdown ---
async function shutdown() {
    console.log("[Workers] Shutting down...");
    await analysisWorker.close();
    await emailWorker.close();
    redisConnection.disconnect();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

console.log("[Workers] Analysis and Email workers started.");
