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
import { DEFAULT_GEMINI_MODEL } from '@/config/constants.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

const aiProvider: AiProvider = config.GEMINI_API_KEY
    ? new GeminiAiProvider()
    : new MockAiProvider();

console.log('[Analysis Worker] AI Provider initialized:', aiProvider.constructor.name);
console.log('[Analysis Worker] GEMINI_API_KEY present:', !!config.GEMINI_API_KEY);
console.log('[Analysis Worker] NODE_ENV:', config.NODE_ENV);

/**
 * Normalize AI response to match DB schema expectations.
 * Different models may return varying structures.
 */
/**
 * Coerce a field that should be a list into one.
 *
 * `(raw.benefits || []).map(...)` threw `.map is not a function` in production when the
 * model returned `benefits` as an object instead of an array — killing the whole job and
 * marking the offer FAILED. Observed live, and nondeterministically: the same prompt
 * produced an array on one request and an object on the next.
 *
 * ponytail: this is damage control, not a fix. The real fix is Phase 1 — put the schema
 * in the prompt, set responseSchema, and validate with Zod so the shape is known before
 * we reach this function.
 */
function asArray(value: unknown, field: string): any[] {
    if (Array.isArray(value)) return value;
    if (value === null || value === undefined) return [];
    console.warn(
        `[Analysis] AI returned "${field}" as ${typeof value}, expected array — coercing to empty.`,
    );
    return [];
}

/**
 * Coerce a field that should be text into a string, or null.
 *
 * Objects and arrays become null rather than "[object Object]" — a wrong-but-plausible
 * string is worse than an absent one, because it reaches the UI looking like real data.
 */
function asText(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
}

function normalizeAiResult(raw: any): AnalysisResult {
    // Normalize benefits — models sometimes return string[] instead of Benefit[]
    const benefits = asArray(raw.benefits, 'benefits').map((b: any) => {
        if (typeof b === 'string') {
            return { name: b, value: null, details: null, isStandard: true };
        }
        // Coerce to strings. Downstream, BenefitsService calls name.toLowerCase(), which
        // threw a 500 when the model returned a non-string name. Intermittent, because it
        // depends on the shape the model happens to choose that request.
        return {
            name: asText(b?.name) ?? 'Unknown',
            value: asText(b?.value),
            details: asText(b?.details),
            isStandard: typeof b?.isStandard === 'boolean' ? b.isStandard : true,
        };
    });

    // Normalize red flags
    const redFlags = asArray(raw.redFlags, 'redFlags').map((f: any) => ({
        type: f.type || 'other',
        severity: f.severity || 'medium',
        title: f.title || 'Unnamed flag',
        explanation: f.explanation || '',
        matchedText: f.matchedText || '',
        suggestion: f.suggestion || '',
    }));

    // Normalize negotiation suggestions
    const negotiationSuggestions = asArray(raw.negotiationSuggestions, 'negotiationSuggestions').map((s: any) => ({
        component: s.component || 'General',
        currentValue: s.currentValue || '',
        suggestedAsk: s.suggestedAsk || '',
        rationale: s.rationale || '',
        priority: s.priority || 'medium',
    }));

    return {
        extractedData: raw.extractedData || {},
        redFlags,
        salaryComparison: raw.salaryComparison || {
            marketRange: { p25: 0, p50: 0, p75: 0, p90: 0 },
            offerPercentile: 50,
            roleUsed: 'unknown',
            roleMatchConfidence: 0,
            locationUsed: 'unknown',
            dataSource: 'ai_estimated',
            disclaimer: 'Salary comparison data unavailable from AI response',
        },
        negotiationSuggestions,
        benefits,
        takeHome: raw.takeHome || null,
        metadata: raw.metadata || {
            analysisVersion: '1.0',
            modelUsed: 'unknown',
            processingNote: 'Metadata missing from AI response',
        },
    };
}

export const analysisWorker = new Worker(
    'analysis-queue',
    async (job: Job) => {
        const { offerId, text, model } = job.data;
        console.log(`[Analysis] Processing job ${job.id} for offer ${offerId} with model: ${model || 'default'}`);

        try {
            // Fetch offer for user context
            const offer = await db.query.offers.findFirst({
                where: eq(offers.id, offerId),
            });

            if (!offer) throw new Error('Offer not found');

            // AI Analysis - use model from job data
            const context = offer.userContext as any; // Cast to OfferContext
            const rawResult = await aiProvider.analyzeOffer(text, context, model || DEFAULT_GEMINI_MODEL);

            // Normalize AI result — models may return varying structures
            const result = normalizeAiResult(rawResult);

            // Hallucination Guard (Simple version: checks if extracted company names etc appear in text approximately)
            // Implementation plan says: verify matchedText in RedFlags against raw text.
            // We will trust the provider for now or add simple verification here.
            // Let's implement simple check if red flags have matched text in raw text.

            const verifiedRedFlags = asArray(result.redFlags, 'redFlags').filter(flag => {
                if (!flag.matchedText) return false;
                // Simple includes check, case insensitive, simplified whitespace
                const normalizedText = text.toLowerCase().replace(/\s+/g, ' ');
                const normalizedMatch = flag.matchedText.toLowerCase().replace(/\s+/g, ' ');
                return normalizedText.includes(normalizedMatch) || normalizedText.includes(normalizedMatch.substring(0, 50));
                // If match is long, maybe it was truncated?
            });

            const discardedCount = (result.redFlags?.length || 0) - verifiedRedFlags.length;

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

            if (result.salaryComparison?.offerPercentile > 75) score += 20;
            else if (result.salaryComparison?.offerPercentile > 50) score += 10;

            // Length of benefits
            if ((result.benefits?.length || 0) > 5) score += 5;

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
                    salaryComparison: result.salaryComparison || {},
                    negotiationSuggestions: result.negotiationSuggestions || [],
                    benefits: result.benefits || [],
                    takeHome: result.takeHome || {},
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

            // Detect rate limit errors
            let failureReason = error.message || 'Analysis failed';

            if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('quota')) {
                failureReason = 'RATE_LIMIT: API rate limit exceeded. Please wait a few minutes and try again, or switch to a different model.';
                console.error(`[Analysis] Rate limit hit for offer ${offerId}`);
            } else if (error.message?.includes('400') || error.message?.includes('invalid')) {
                failureReason = 'INVALID_REQUEST: The AI model encountered an error processing your offer. Please try a different model.';
            } else if (error.message?.includes('500') || error.message?.includes('internal')) {
                failureReason = 'AI_ERROR: The AI service encountered an internal error. Please try again.';
            }

            await db.update(offers).set({
                status: 'FAILED',
                failureReason: failureReason
            }).where(eq(offers.id, offerId));
            throw error;
        }
    },
    defaultWorkerOptions
);
