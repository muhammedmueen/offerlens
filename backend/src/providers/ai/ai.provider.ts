import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

/**
 * Context the candidate typed on the upload form, stored as `offers.userContext`.
 *
 * Corrected to match what is actually stored. This declared `experienceYears` and
 * `expectedCTC`, which nothing in the codebase ever produced or read — `OfferService`
 * writes `experienceLevel` and `currentCtc`, and the analysis worker's `as any` cast
 * hid the discrepancy. The AI was receiving fields the type said did not exist.
 */
export interface OfferContext {
    role?: string;
    city?: string;
    /** A banded label, e.g. "Senior (5-8 yrs)" — not a number of years. */
    experienceLevel?: string;
    currentCtc?: number;
    currency?: string;
}

export interface NegotiationInput {
    companyName: string;
    role: string;
    currentOffer: any;
    marketData: any;
    suggestions: any[];
    tone: string;
    focusAreas?: string[];
}

export interface AiProvider {
    analyzeOffer(text: string, context?: OfferContext, model?: string): Promise<AnalysisResult>;
    generateNegotiationScript(input: NegotiationInput): Promise<{ subject: string; body: string }>;
    /**
     * Extracts structured metadata from offer text for autofill
     */
    extractMetadata(text: string): Promise<{
        role?: string;
        city?: string;
        experienceLevel?: string;
        currentCtc?: number;
        currency?: string;
    }>;

    generateCareerPath(input: { role: string; companyType: string; industry: string }): Promise<any>;
}
