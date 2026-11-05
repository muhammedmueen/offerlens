import { AiProvider, OfferContext } from './ai.provider.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import { recordSafely, type UsagePurpose, type UsageRecorder } from './usage.js';

// Only enough reading of the letter for E2E runs to get offers that differ (Compare needs a winner)
// and a benefits checklist that reacts to the text. Not extraction, and the eval harness says so.
// shortcut: regexes cover the corpus's phrasing only, upgrade by adding patterns when a spec needs one.
const COMPANY_PATTERN =
    /([A-Z][\w&]*(?: [A-Z][\w&]*)* (?:Private Limited|Pvt\.? Ltd\.?|LLP|Limited|Ltd\.?|Inc\.?))/;
const CTC_PATTERN = /(?:\bCTC\b|cost to company)\D*?(\d[\d,]{4,})/i;
const BENEFIT_KEYWORDS: Array<[RegExp, string]> = [
    [/provident fund|\bPF\b/i, 'Provident Fund'],
    [/health insurance|medical insurance/i, 'Health Insurance'],
    [/paid leave|paid time off/i, 'Paid Leave'],
];

export function readMockFields(text: string): { companyName: string; totalCTC: number; benefits: string[] } {
    const flat = text.replace(/\s+/g, ' ');
    const ctc = CTC_PATTERN.exec(flat)?.[1];
    return {
        companyName: COMPANY_PATTERN.exec(flat)?.[1] ?? 'Mock Corp',
        totalCTC: ctc ? Number(ctc.replace(/,/g, '')) : 1200000,
        benefits: BENEFIT_KEYWORDS.filter(([pattern]) => pattern.test(flat)).map(([, name]) => name),
    };
}

export class MockAiProvider implements AiProvider {
    /** Set by the factory, same as the real providers. Mock calls are billedTo 'mock'. */
    recorder: UsageRecorder | null = null;

    /** One zero-cost, zero-token row per call, so the mock still shows up in the ledger. */
    private async meter(purpose: UsagePurpose, model?: string): Promise<void> {
        await recordSafely(this.recorder, {
            purpose,
            provider: 'mock',
            model: model || 'mock-v1',
            inputTokens: 0,
            outputTokens: 0,
            thinkingTokens: 0,
            units: null,
            costUsd: null,
            success: true,
            errorCode: null,
        });
    }

    async analyzeOffer(text: string, context?: OfferContext, model?: string): Promise<AnalysisResult> {
        await this.meter('analysis', model);
        const fields = readMockFields(text);
        // Return sample analysis
        return {
            extractedData: {
                companyName: fields.companyName,
                role: context?.role || 'Software Engineer',
                department: 'Engineering',
                joiningDate: '2026-03-01',
                location: context?.city || 'Bangalore',
                industry: 'Technology',
                companyType: 'product',
                employmentType: 'full-time',
                compensation: {
                    currency: context?.currency || 'INR',
                    baseSalary: { amount: fields.totalCTC, period: 'annual' },
                    variablePay: null,
                    equity: null,
                    totalCTC: fields.totalCTC,
                    otherComponents: [],
                },
                noticePeriod: '30 days',
                probationPeriod: '6 months',
            },
            redFlags: [],
            salaryComparison: {
                marketRange: { p25: 1000000, p50: 1500000, p75: 2000000, p90: 2500000 },
                offerPercentile: 30,
                roleUsed: 'Software Engineer',
                roleMatchConfidence: 0.9,
                locationUsed: 'Bangalore',
                dataSource: 'ai_estimated',
                disclaimer: 'Estimated based on mock data',
            },
            negotiationSuggestions: [
                {
                    component: 'Base salary',
                    currentValue: 'As offered',
                    suggestedAsk: 'A 10% higher base',
                    rationale: 'Sample tip from the mock provider.',
                    priority: 'high',
                },
            ],
            benefits: fields.benefits.map((name) => ({ name, value: null, details: null, isStandard: true })),
            // No takeHome: it is computed by the worker, not returned by a provider.
            metadata: {
                // Not a PROMPT_VERSION: no prompt was sent and no model answered, so
                // reporting a real contract revision would make fixture data indistinguishable
                // from analysis in the database.
                analysisVersion: 'mock',
                modelUsed: model || 'mock-v1',
                processingNote: 'This is a mock analysis for testing.',
            },
        };
    }
    async generateNegotiationScript(input: any): Promise<{ subject: string; body: string }> {
        await this.meter('negotiation');
        return {
            subject: `Discussing the ${input.role} offer at ${input.companyName}`,
            body: `Dear Hiring Manager,\n\nThank you for the offer... [Mock Negotiation Script] ...\n\nSincerely,\n[Your Name]`,
        };
    }

    // Mock ignores the input; the param exists to satisfy AiProvider.
    async extractMetadata(_text: string): Promise<any> {
        await this.meter('metadata');
        return {
            role: 'Mock Software Engineer',
            city: 'Mock City',
            experienceLevel: 'Senior',
            currentCtc: 1500000,
            currency: 'INR'
        };
    }

    async generateCareerPath(input: { role: string; companyType: string; industry: string }): Promise<any> {
        await this.meter('career');
        return {
            timeline: [
                { year: 1, title: input.role, focus: "Onboarding & learning core stack" },
                { year: 3, title: `Senior ${input.role}`, focus: "Mentoring & system design" },
                { year: 5, title: `Staff ${input.role}`, focus: "Architecture & strategy" }
            ],
            skillsToLearn: ["System Design", "Leadership", "Cloud Architecture"],
            potentialRoles: ["Engineering Manager", "Principal Engineer"]
        };
    }
}
