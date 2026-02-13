import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

export interface OfferContext {
    role?: string;
    experienceYears?: number;
    city?: string;
    expectedCTC?: number;
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
    analyzeOffer(text: string, context?: OfferContext): Promise<AnalysisResult>;
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
