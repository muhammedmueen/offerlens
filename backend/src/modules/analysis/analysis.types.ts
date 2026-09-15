
export interface AnalysisResult {
    extractedData: {
        companyName: string | null;
        role: string | null;
        department: string | null;
        joiningDate: string | null;
        location: string | null;
        employmentType: 'full-time' | 'part-time' | 'contract' | 'intern';
        compensation: Compensation;
        noticePeriod: string | null;
        probationPeriod: string | null;
    };
    redFlags: RedFlag[];
    salaryComparison: SalaryComparison;
    negotiationSuggestions: NegotiationSuggestion[];
    benefits: Benefit[];
    takeHome: {
        monthlyEstimate: number | null;
        assumptions: string | null;
    } | null;
    metadata: {
        analysisVersion: string;
        modelUsed: string;
        processingNote: string | null;
    };
}

export interface Compensation {
    currency: string;
    baseSalary: { amount: number; period: 'monthly' | 'annual' };
    variablePay: { amount: number | null; type: string | null; details: string | null } | null;
    equity: { type: string | null; quantity: number | null; vestingSchedule: string | null; strikePrice: number | null; cliffMonths: number | null } | null;
    totalCTC: number | null;
    otherComponents: { name: string; amount: number | null; details: string | null }[];
}

export interface RedFlag {
    type: 'non_compete' | 'bond' | 'vague_compensation' | 'missing_benefit' | 'clawback' | 'ip_assignment' | 'probation' | 'other';
    severity: 'high' | 'medium' | 'low';
    title: string;
    explanation: string;
    matchedText: string;
    suggestion: string;
}

export interface SalaryComparison {
    marketRange: { p25: number; p50: number; p75: number; p90: number };
    offerPercentile: number;
    roleUsed: string;
    roleMatchConfidence: number;
    locationUsed: string;
    dataSource: 'ai_estimated' | 'crowdsourced';
    disclaimer: string | null;
}

export interface NegotiationSuggestion {
    component: string;
    currentValue: string;
    suggestedAsk: string;
    rationale: string;
    priority: 'high' | 'medium' | 'low';
}

export interface Benefit {
    name: string;
    value: string | null;
    details: string | null;
    isStandard: boolean;
}

/**
 * What `GET /offers/:id/analysis` returns.
 *
 * `AnalysisResult` is the AI provider's output contract, so it deliberately carries no
 * score and no offer context. The results view needs both: the score is computed by the
 * worker after the AI returns, and `expiresAt` / `ocrConfidence` / `status` live on the
 * offer row.
 *
 * Previously the route returned bare `AnalysisResult`, so the score — the product's
 * headline number — was computed, stored, and then never sent to the browser.
 */
export interface AnalysisResponse extends AnalysisResult {
    /** 0-100 composite. Computed in the analysis worker, not by the AI. */
    score: number;
    scoreLabel: string;
    /** 'standard' | 'fallback' — 'fallback' means the UI should say "estimated". */
    scoringMethod: string;
    lowConfidence: boolean;
    /** Red flags dropped by the hallucination guard because their quote wasn't in the text. */
    redFlagsDiscarded: number;
    /** Offer-level context the results view needs. */
    offerStatus: string;
    expiresAt: Date | null;
    ocrConfidence: number | null;
}

export interface ScoreBreakdown {
    salaryScore: number;
    redFlagScore: number;
    benefitsScore: number;
    growthScore: number;
    totalScore: number;
}
