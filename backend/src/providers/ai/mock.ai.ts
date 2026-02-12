import { AiProvider, OfferContext } from './ai.provider.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';

export class MockAiProvider implements AiProvider {
    async analyzeOffer(text: string, context?: OfferContext): Promise<AnalysisResult> {
        // Return sample analysis
        return {
            extractedData: {
                companyName: 'Mock Corp',
                role: context?.role || 'Software Engineer',
                department: 'Engineering',
                joiningDate: '2026-03-01',
                location: context?.city || 'Bangalore',
                employmentType: 'full-time',
                compensation: {
                    currency: context?.currency || 'INR',
                    baseSalary: { amount: 1200000, period: 'annual' },
                    variablePay: null,
                    equity: null,
                    totalCTC: 1200000,
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
            negotiationSuggestions: [],
            benefits: [],
            takeHome: {
                monthlyEstimate: 85000,
                assumptions: 'Standard tax deductions',
            },
            metadata: {
                analysisVersion: '1.0',
                modelUsed: 'mock-v1',
                processingNote: 'This is a mock analysis for testing.',
            },
        };
    }
    async generateNegotiationScript(input: any): Promise<{ subject: string; body: string }> {
        return {
            subject: `Discussing the ${input.role} offer at ${input.companyName}`,
            body: `Dear Hiring Manager,\n\nThank you for the offer... [Mock Negotiation Script] ...\n\nSincerely,\n[Your Name]`,
        };
    }

    async generateCareerPath(input: { role: string; companyType: string; industry: string }): Promise<any> {
        return {
            timeline: [
                { year: 1, title: input.role, focus: "Onboarding & learning core stack", salaryRange: "10-15 LPA" },
                { year: 3, title: `Senior ${input.role}`, focus: "Mentoring & system design", salaryRange: "20-30 LPA" },
                { year: 5, title: `Staff ${input.role}`, focus: "Architecture & strategy", salaryRange: "40-60 LPA" }
            ],
            skillsToLearn: ["System Design", "Leadership", "Cloud Architecture"],
            potentialRoles: ["Engineering Manager", "Principal Engineer"]
        };
    }
}
