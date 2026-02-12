import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

export class NegotiationService {
    constructor(private fastify: FastifyInstance) { }

    async generateScript(
        offerId: string,
        userId: string,
        options?: { tone?: string; focusAreas?: string[] }
    ) {
        // Verify offer exists and belongs to user
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, offerId),
        });

        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        if (offer.userId !== userId) throw new AppError(ERROR_CODES.UNAUTHORIZED, 'Not authorized to access this offer', 403);
        if (offer.status !== 'COMPLETED') {
            throw new AppError(ERROR_CODES.OFFER_NOT_READY, 'Offer analysis must be completed before generating a negotiation script', 400);
        }

        // Get analysis data
        const analysis = await db.query.analyses.findFirst({
            where: eq(analyses.offerId, offerId),
        });

        if (!analysis) throw new AppError(ERROR_CODES.NOT_FOUND, 'Analysis not found', 404);

        const extractedData = analysis.extractedData as AnalysisResult['extractedData'];
        const salaryComparison = analysis.salaryComparison as AnalysisResult['salaryComparison'];
        const suggestions = analysis.negotiationSuggestions as AnalysisResult['negotiationSuggestions'];

        // Check if we have enough data for a personalized script
        const hasEnoughData = extractedData.companyName && extractedData.compensation?.baseSalary;

        if (!hasEnoughData) {
            // Return generic template with placeholders
            return {
                type: 'template' as const,
                subject: 'Re: Offer Letter Discussion - [YOUR NAME]',
                body: this.getGenericTemplate(options?.tone || 'professional'),
                note: "We couldn't extract enough detail for a fully personalized script. Please fill in the bracketed fields.",
                suggestions: suggestions || [],
            };
        }

        // Generate personalized script using AI
        const script = await this.fastify.ai.generateNegotiationScript({
            companyName: extractedData.companyName!,
            role: extractedData.role || '[ROLE]',
            currentOffer: extractedData.compensation,
            marketData: salaryComparison,
            suggestions,
            tone: options?.tone || 'professional',
            focusAreas: options?.focusAreas,
        });

        return {
            type: 'personalized' as const,
            ...script,
            suggestions,
        };
    }

    private getGenericTemplate(tone: string): string {
        const tonePrefix = tone === 'assertive'
            ? 'I would like to discuss'
            : tone === 'friendly'
                ? 'I appreciate the offer and would love to discuss'
                : 'I am writing to respectfully discuss';

        return `Dear [HIRING MANAGER NAME],

Thank you for extending the offer for the [POSITION] role at [COMPANY NAME]. I am excited about the opportunity to contribute to your team.

${tonePrefix} the compensation package. Based on my research of market rates for this role and location, I believe there is room for adjustment.

Specifically, I would like to discuss:
1. Base salary: [YOUR TARGET SALARY] (current offer: [OFFERED SALARY])
2. [ADDITIONAL POINT 1]
3. [ADDITIONAL POINT 2]

I am confident in the value I would bring to [COMPANY NAME] and look forward to finding a mutually beneficial arrangement.

Best regards,
[YOUR NAME]`;
    }
}
