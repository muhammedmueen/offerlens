import OpenAI from "openai";
import { logger } from "../utils/logger";

// Extracted offer data structure
export interface ExtractedOfferData {
    companyName?: string;
    jobTitle?: string;
    baseSalary?: number;
    currency?: string;
    equity?: string;
    signOnBonus?: number;
    startDate?: string;
    location?: string;
    probationPeriod?: string;
    noticePeriod?: string;
    ptoPolicy?: string;
    extractionConfidence: number;
    rawText?: string;
}

// Zod-like extraction result
interface ExtractionResult {
    data: ExtractedOfferData;
    method: "regex" | "llm" | "hybrid";
    missingFields: string[];
}

/**
 * Extraction Service - Hybrid approach
 * 1. First pass: Regex/Pattern matching (free, fast)
 * 2. Second pass: LLM for missing fields only (cost-optimized)
 */
export class ExtractionService {
    private openai: OpenAI | null = null;

    constructor() {
        if (process.env.OPENAI_API_KEY) {
            this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
        }
    }

    /**
     * Main extraction method - Hybrid approach
     */
    async extractOfferData(rawText: string): Promise<ExtractionResult> {
        logger.info("[Extraction] Starting hybrid extraction");

        // Step 1: Regex extraction (free, fast)
        const regexResult = this.extractWithRegex(rawText);
        const missingFields = this.findMissingFields(regexResult);

        logger.info(`[Extraction] Regex extracted ${Object.keys(regexResult).filter(k => regexResult[k as keyof ExtractedOfferData]).length} fields, missing: ${missingFields.join(", ") || "none"}`);

        // If regex got everything important, return early (cost savings)
        const criticalFields = ["baseSalary", "jobTitle"];
        const criticalMissing = missingFields.filter(f => criticalFields.includes(f));

        if (criticalMissing.length === 0) {
            logger.info("[Extraction] Regex sufficient, skipping LLM");
            return {
                data: { ...regexResult, rawText, extractionConfidence: 0.85 },
                method: "regex",
                missingFields,
            };
        }

        // Step 2: LLM fallback for missing critical fields
        if (this.openai) {
            logger.info("[Extraction] Using LLM for missing fields");
            const llmResult = await this.extractWithLLM(rawText, missingFields);
            const merged = { ...regexResult, ...llmResult, rawText, extractionConfidence: 0.95 };
            return {
                data: merged,
                method: "hybrid",
                missingFields: this.findMissingFields(merged),
            };
        }

        // No LLM available
        return {
            data: { ...regexResult, rawText, extractionConfidence: 0.7 },
            method: "regex",
            missingFields,
        };
    }

    /**
     * Regex-based extraction - Zero cost, instant
     */
    private extractWithRegex(text: string): Partial<ExtractedOfferData> {
        const result: Partial<ExtractedOfferData> = {};
        const normalized = text.replace(/\s+/g, " ");

        // Salary patterns (handles multiple formats)
        const salaryPatterns = [
            /(?:salary|ctc|compensation|package|annual|per\s*annum)[:\s]*(?:(?:rs\.?|inr|₹|usd|\$)\s*)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:lpa|lac|lakh|k|per\s*annum)?/i,
            /(?:rs\.?|inr|₹)\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:lpa|lac|lakh|k|per\s*annum)?/i,
            /\$\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*(?:k|K|per\s*year|annually)?/i,
        ];

        for (const pattern of salaryPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                let salary = parseFloat(match[1].replace(/,/g, ""));
                // Normalize to annual if needed
                if (/\bk\b/i.test(match[0])) salary *= 1000;
                if (/\b(lpa|lac|lakh)\b/i.test(match[0])) salary *= 100000;
                result.baseSalary = salary;
                break;
            }
        }

        // Currency detection
        if (/(?:rs\.?|inr|₹)/i.test(text)) result.currency = "INR";
        else if (/(?:usd|\$)/i.test(text)) result.currency = "USD";
        else if (/(?:gbp|£)/i.test(text)) result.currency = "GBP";

        // Job title patterns
        const titlePatterns = [
            /(?:position|role|designation|title)[:\s]*([A-Za-z\s-]{3,50}?)(?:\.|,|\n|at|with)/i,
            /(?:offer\s+(?:for|of)\s+(?:the\s+)?(?:position|role)\s+of)[:\s]*([A-Za-z\s-]{3,50})/i,
        ];

        for (const pattern of titlePatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.jobTitle = match[1].trim();
                break;
            }
        }

        // Company name
        const companyPatterns = [
            /(?:from|at|with|company)[:\s]*([A-Za-z0-9\s&.-]{2,50}?)(?:\sis\s|\.|,|\n|offer)/i,
            /^([A-Za-z0-9\s&.-]{2,40})\s*(?:pvt\.?|private|limited|ltd\.?|inc\.?|corp\.?)/im,
        ];

        for (const pattern of companyPatterns) {
            const match = text.match(pattern);
            if (match) {
                result.companyName = match[1].trim();
                break;
            }
        }

        // Start date
        const datePatterns = [
            /(?:start\s*date|joining\s*date|commence|begin)[:\s]*(\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4})/i,
            /(?:start\s*date|joining\s*date)[:\s]*(\d{1,2}(?:st|nd|rd|th)?\s+[A-Za-z]+\s+\d{4})/i,
        ];

        for (const pattern of datePatterns) {
            const match = normalized.match(pattern);
            if (match) {
                result.startDate = match[1].trim();
                break;
            }
        }

        // Location
        const locationMatch = normalized.match(/(?:location|office|based\s+(?:in|at)|work\s+(?:from|at))[:\s]*([A-Za-z\s,.-]{3,50}?)(?:\.|,|\n)/i);
        if (locationMatch) result.location = locationMatch[1].trim();

        // Equity/Stock
        const equityMatch = text.match(/(?:equity|stock|esop|rsu|options)[:\s]*([^.]*?)(?:\.|,|;|\n)/i);
        if (equityMatch) result.equity = equityMatch[1].trim();

        // Sign-on bonus
        const bonusMatch = normalized.match(/(?:sign[- ]?on|signing|joining)\s*bonus[:\s]*(?:(?:rs\.?|inr|₹|usd|\$)\s*)?(\d{1,3}(?:,\d{3})*)/i);
        if (bonusMatch) result.signOnBonus = parseFloat(bonusMatch[1].replace(/,/g, ""));

        // Notice period
        const noticeMatch = normalized.match(/(?:notice\s*period)[:\s]*(\d+\s*(?:days?|months?|weeks?))/i);
        if (noticeMatch) result.noticePeriod = noticeMatch[1].trim();

        // Probation period
        const probationMatch = normalized.match(/(?:probation(?:ary)?\s*period)[:\s]*(\d+\s*(?:days?|months?))/i);
        if (probationMatch) result.probationPeriod = probationMatch[1].trim();

        return result;
    }

    /**
     * LLM extraction for missing fields only - Cost optimized
     */
    private async extractWithLLM(text: string, missingFields: string[]): Promise<Partial<ExtractedOfferData>> {
        if (!this.openai) return {};

        const prompt = `Extract the following fields from this job offer letter. Return JSON only.
    
Fields to extract: ${missingFields.join(", ")}

Offer letter text (truncated):
${text.slice(0, 4000)}

Return a JSON object with only the requested fields. Use null for fields not found.`;

        try {
            const response = await this.openai.chat.completions.create({
                model: "gpt-3.5-turbo", // Cheaper model for extraction
                messages: [{ role: "user", content: prompt }],
                response_format: { type: "json_object" },
                max_tokens: 500,
                temperature: 0,
            });

            const content = response.choices[0]?.message?.content;
            if (content) {
                const parsed = JSON.parse(content);
                logger.info("[Extraction] LLM extraction successful");
                return this.normalizeExtractedData(parsed);
            }
        } catch (error) {
            logger.error("[Extraction] LLM extraction failed", { error });
        }

        return {};
    }

    /**
     * Normalize LLM output to match our schema
     */
    private normalizeExtractedData(data: Record<string, unknown>): Partial<ExtractedOfferData> {
        const result: Partial<ExtractedOfferData> = {};

        if (data.baseSalary) result.baseSalary = Number(data.baseSalary);
        if (data.jobTitle) result.jobTitle = String(data.jobTitle);
        if (data.companyName) result.companyName = String(data.companyName);
        if (data.currency) result.currency = String(data.currency);
        if (data.equity) result.equity = String(data.equity);
        if (data.signOnBonus) result.signOnBonus = Number(data.signOnBonus);
        if (data.startDate) result.startDate = String(data.startDate);
        if (data.location) result.location = String(data.location);
        if (data.probationPeriod) result.probationPeriod = String(data.probationPeriod);
        if (data.noticePeriod) result.noticePeriod = String(data.noticePeriod);
        if (data.ptoPolicy) result.ptoPolicy = String(data.ptoPolicy);

        return result;
    }

    /**
     * Identify missing fields
     */
    private findMissingFields(data: Partial<ExtractedOfferData>): string[] {
        const importantFields = ["baseSalary", "jobTitle", "companyName", "currency", "startDate", "location"];
        return importantFields.filter(field => !data[field as keyof ExtractedOfferData]);
    }
}

export const extractionService = new ExtractionService();
