import { Queue } from "bullmq";
import Redis from "ioredis";

// Redis connection for BullMQ
const redisConnection = new Redis(process.env.REDIS_URL || "redis://localhost:6379", {
    maxRetriesPerRequest: null,
});

// --- Queue Definitions ---

/**
 * Analysis Queue: Handles async AI processing tasks
 * - PDF Extraction
 * - Red Flag Vector Search
 * - Market Salary Lookup
 */
export const analysisQueue = new Queue("analysis-queue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "exponential",
            delay: 1000,
        },
        removeOnComplete: 100,
        removeOnFail: 500,
    },
});

/**
 * Email Queue: Handles transactional emails
 * - Negotiation Script Delivery
 * - Follow-up Survey (7 days later)
 */
export const emailQueue = new Queue("email-queue", {
    connection: redisConnection,
    defaultJobOptions: {
        attempts: 3,
        backoff: {
            type: "fixed",
            delay: 5000,
        },
        removeOnComplete: 50,
        removeOnFail: 200,
    },
});

// --- Job Types (for type safety) ---

export type AnalysisJobData =
    | { type: "EXTRACT_OFFER"; offerId: string; fileUrl: string }
    | { type: "DETECT_RED_FLAGS"; offerId: string; extractedText: string }
    | { type: "LOOKUP_MARKET_DATA"; offerId: string; role: string; location: string; yoe: number };

export type EmailJobData =
    | { type: "SEND_NEGOTIATION_SCRIPT"; email: string; offerId: string; scriptContent: string }
    | { type: "SEND_FOLLOWUP_SURVEY"; email: string; offerId: string };

// --- Utility: Add Jobs ---

export async function enqueueAnalysisJob(data: AnalysisJobData) {
    return analysisQueue.add(data.type, data);
}

export async function enqueueEmail(data: EmailJobData, delay?: number) {
    return emailQueue.add(data.type, data, { delay });
}

// --- Shutdown Handler ---

export async function closeQueues() {
    await analysisQueue.close();
    await emailQueue.close();
    redisConnection.disconnect();
}

export { redisConnection };
