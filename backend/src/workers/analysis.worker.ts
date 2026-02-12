import { Worker, Job } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { AiProvider } from '@/providers/ai/ai.provider.js';
import { GeminiAiProvider } from '@/providers/ai/gemini.ai.js';
import { MockAiProvider } from '@/providers/ai/mock.ai.js';
import { config } from '@/config/index.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

const aiProvider: AiProvider = config.GEMINI_API_KEY && config.NODE_ENV === 'production'
    ? new GeminiAiProvider()
    : new MockAiProvider();

export const analysisWorker = new Worker(
    'analysis-queue',
    async (job: Job) => {
        const { offerId, text } = job.data;
        console.log(`[Analysis] Processing job ${job.id} for offer ${offerId}`);

        try {
            // Fetch offer for user context
            const offer = await db.query.offers.findFirst({
                where: eq(offers.id, offerId),
            });

            if (!offer) throw new Error('Offer not found');

            // AI Analysis
            const context = offer.userContext as any; // Cast to OfferContext
            const result: AnalysisResult = await aiProvider.analyzeOffer(text, context);

            // Hallucination Guard (Simple version: checks if extracted company names etc appear in text approximately)
            // Implementation plan says: verify matchedText in RedFlags against raw text.
            // We will trust the provider for now or add simple verification here.
            // Let's implement simple check if red flags have matched text in raw text.

            const verifiedRedFlags = result.redFlags.filter(flag => {
                if (!flag.matchedText) return false;
                // Simple includes check, case insensitive, simplified whitespace
                const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
                const normalizedMatch = flag.matchedText.toLowerCase().replace(/\s+/g, ' ');
                return normalizedText.includes(normalizedMatch) || normalizedText.includes(normalizedMatch.substring(0, 50));
                // If match is long, maybe it was truncated?
            });

            const discardedCount = result.redFlags.length - verifiedRedFlags.length;

            // Calculate Score (Deterministic based on rubric)
            // For now, assume AI returned score breakdown or we compute it?
            // Type AnalysisResult has `ScoreBreakdown`? No, schema has `score` and `scoreLabel` in DB but types `AnalysisResult` has `ScoreBreakdown`?
            // Wait, `AnalysisResult` in `analysis.types.ts` has `metadata` etc but schema needs integer score.
            // We need to calculate the score if AI didn't give it, or use what AI gave.
            // The `AnalysisResult` type in `analysis.types.ts` DOES NOT have `score` at root level.
            // It has `ScoreBreakdown` type defined but not used in `AnalysisResult` interface?
            // Checking `analysis.types.ts` content I wrote previously... I missed adding `score` to `AnalysisResult`?
            // Let's check `analysis.types.ts`.
            // It has `extractedData`, `redFlags`, `salaryComparison` etc. It does NOT have `score`.
            // So we must compute score here from the data.

            // Computing Score (Simplified Logic for MVP):
            // 100 base
            // -5 per Med severity flag
            // -10 per High severity flag
            // +10 if salary > 50th percentile
            // +20 if salary > 75th percentile
            // Cap at 100, min 0.

            let score = 70; // Baseline
            verifiedRedFlags.forEach(f => {
                if (f.severity === 'high') score -= 15;
                if (f.severity === 'medium') score -= 5;
            });

            if (result.salaryComparison.offerPercentile > 75) score += 20;
            else if (result.salaryComparison.offerPercentile > 50) score += 10;

            // Length of benefits
            if (result.benefits.length > 5) score += 5;

            score = Math.max(0, Math.min(100, score));

            let label = 'fair';
            if (score >= 90) label = 'excellent';
            else if (score >= 75) label = 'good';
            else if (score >= 60) label = 'fair';
            else if (score >= 40) label = 'weak';
            else label = 'poor';

            // Save to DB
            await db.transaction(async (tx) => {
                await tx.insert(analyses).values({
                    offerId,
                    score,
                    scoreLabel: label,
                    scoringMethod: 'standard',
                    extractedData: result.extractedData,
                    redFlags: verifiedRedFlags,
                    salaryComparison: result.salaryComparison,
                    negotiationSuggestions: result.negotiationSuggestions,
                    benefits: result.benefits,
                    takeHome: result.takeHome,
                    aiMetadata: result.metadata,
                    lowConfidence: false, // Calculate from AI metadata if possible
                    redFlagsDiscarded: discardedCount,
                    processingTimeMs: Date.now() - new Date(offer.updatedAt).getTime(), // Approx
                });

                await tx.update(offers).set({ status: 'COMPLETED' }).where(eq(offers.id, offerId));
            });

            console.log(`[Analysis] Job ${job.id} completed. Score: ${score}`);
        } catch (error: any) {
            console.error(`[Analysis] Job ${job.id} failed:`, error);
            await db.update(offers).set({
                status: 'FAILED',
                failureReason: error.message || 'Analysis failed'
            }).where(eq(offers.id, offerId));
            throw error;
        }
    },
    defaultWorkerOptions
);
