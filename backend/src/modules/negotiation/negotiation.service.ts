import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { assertOfferAccess } from '@/shared/access/offer-access.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { createAiProvider, type AiProviderSelection } from '@/providers/ai/ai.factory.js';
import { buildNegotiationTemplate, hasNegotiableDetail } from './negotiation.template.js';

export class NegotiationService {
    constructor(private fastify: FastifyInstance) { }

    async generateScript(
        offerId: string,
        userId: string,
        options?: { tone?: string; focusAreas?: string[] },
        selection: AiProviderSelection = {},
    ) {
        // Verify offer exists and belongs to user
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, offerId),
        });

        if (!offer) throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        assertOfferAccess(offer, { userId });
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

        const template = () => buildNegotiationTemplate({
            tone: options?.tone,
            companyName: extractedData?.companyName,
            role: extractedData?.role,
            totalCtc: extractedData?.compensation?.totalCTC,
            currency: extractedData?.compensation?.currency,
            focusAreas: options?.focusAreas,
        });

        // Gated on `totalCTC or basic`, not on basic alone. Task 9 made baseSalary nullable so a
        // CTC-only letter stops reporting CTC as basic, and 6 of the 17 corpus letters have no
        // stated basic — so the old gate had started sending roughly a third of users a
        // fill-in-the-blanks email.
        if (!hasNegotiableDetail(extractedData)) {
            return {
                type: 'template' as const,
                ...template(),
                note: 'We could not extract enough detail from this letter for a fully '
                    + 'personalised script. The bracketed fields are yours to fill in.',
                suggestions: suggestions || [],
            };
        }

        try {
            const script = await createAiProvider(selection, {
                userId: offer.userId,
                guestId: offer.guestId,
                offerId,
            }).generateNegotiationScript({
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
        } catch (error) {
            // Task 21's actual point. The template existed but only ever fired for thin
            // extraction, so a provider outage or an exhausted quota returned a 500 and the
            // drawer showed an error — even though everything needed to write a usable email by
            // hand was already extracted and sitting in the database.
            this.fastify.log.error(
                { err: error, offerId },
                'Negotiation script generation failed, falling back to the template',
            );

            return {
                type: 'template' as const,
                ...template(),
                note: 'The AI service could not be reached, so this is a template rather than a '
                    + 'tailored script. Your company, role and offer figure are filled in; the '
                    + 'bracketed fields are yours. Try again in a few minutes for the full version.',
                suggestions: suggestions || [],
            };
        }
    }

}
