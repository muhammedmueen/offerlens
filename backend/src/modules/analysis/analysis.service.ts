import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AnalysisResult, AnalysisResponse } from './analysis.types.js';
import { checkBenefits } from '@/modules/benefits/benefits.checklist.js';
import { assessConfidence } from './confidence.js';

export class AnalysisService {
    constructor(private fastify: FastifyInstance) { }

    async getAnalysis(offerId: string): Promise<AnalysisResponse | null> {
        const analysis = await db.query.analyses.findFirst({
            where: eq(analyses.offerId, offerId),
        });

        if (!analysis) return null;

        // The results view also needs offer-level context: the guest expiry banner and
        // the low-OCR-confidence warning both live on the offer, not the analysis.
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, offerId),
        });

        const storedMetadata = analysis.aiMetadata as AnalysisResult['metadata'];
        const storedBreakdown = analysis.scoreBreakdown as
            { components: AnalysisResponse['scoreBreakdown']; note: string | null } | null;

        return {
            // Score is computed by the worker after the AI returns, so it is not part of
            // AnalysisResult. It was previously stored and never returned.
            score: analysis.score,
            scoreLabel: analysis.scoreLabel,
            scoringMethod: analysis.scoringMethod,
            lowConfidence: analysis.lowConfidence,
            redFlagsDiscarded: analysis.redFlagsDiscarded,

            offerStatus: offer?.status ?? 'COMPLETED',
            expiresAt: offer?.expiresAt ?? null,
            ocrConfidence: offer?.ocrConfidence ?? null,

            extractedData: analysis.extractedData as AnalysisResult['extractedData'],
            redFlags: analysis.redFlags as AnalysisResult['redFlags'],
            salaryComparison: analysis.salaryComparison as AnalysisResult['salaryComparison'],
            negotiationSuggestions: analysis.negotiationSuggestions as AnalysisResult['negotiationSuggestions'],
            benefits: analysis.benefits as AnalysisResult['benefits'],
            // Computed by the worker from published tax slabs, not returned by the AI.
            takeHome: analysis.takeHome as AnalysisResponse['takeHome'],

            // Derived here rather than stored: a pure function of the benefits column, so it
            // needs no migration and always reflects the current checklist.
            benefitsChecklist: checkBenefits(analysis.benefits as AnalysisResult['benefits']),

            // Stored at analysis time, so the parts always sum to the score that was recorded.
            // Null for rows written before task 10.
            scoreBreakdown: storedBreakdown?.components ?? null,
            scoreNote: storedBreakdown?.note ?? null,

            // Derived here, like the benefits checklist: a pure function of the analysis plus the
            // letter, both already persisted. Needs the raw text, which is why it cannot be
            // computed by the provider — and should not be, since the point is to check the
            // model's output against its own input rather than to ask the model how sure it is.
            confidence: assessConfidence({
                extractedData: analysis.extractedData as AnalysisResult['extractedData'],
                redFlags: analysis.redFlags as AnalysisResult['redFlags'],
                benefits: analysis.benefits as AnalysisResult['benefits'],
                salaryComparison: analysis.salaryComparison as AnalysisResult['salaryComparison'],
                takeHome: analysis.takeHome as AnalysisResponse['takeHome'],
                rawText: offer?.rawText ?? null,
                ocrConfidence: offer?.ocrConfidence ?? null,
            }),

            // Fields are picked explicitly rather than spreading aiMetadata, because
            // aiMetadata now also carries token counts and an estimated USD cost per call.
            // That is operational data: it exposes unit economics to anyone who opens the
            // network tab, and on a freemium plan that is margin information. It stays in
            // the database and does not cross to the client.
            metadata: {
                analysisVersion: storedMetadata.analysisVersion,
                modelUsed: storedMetadata.modelUsed,
                processingNote: storedMetadata.processingNote,
            },
        };
    }
}
