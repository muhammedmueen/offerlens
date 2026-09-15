import { AiProvider, OfferContext } from './ai.provider.js';
import { AnalysisResult } from '@/modules/analysis/analysis.types.js';
import {
    analysisResultSchema, GEMINI_RESPONSE_SCHEMA, type ValidatedAnalysis,
} from '@/modules/analysis/analysis.zod.js';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './analysis.prompt.js';
import { GoogleGenerativeAI, type GenerativeModel } from '@google/generative-ai';
import { config } from '@/config/index.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { GEMINI_FALLBACK_MODELS, DEFAULT_GEMINI_MODEL } from '@/config/constants.js';

/**
 * Is this error worth retrying on a different model?
 *
 * Covers three server-side conditions, all meaning "this model can't serve you right
 * now" rather than "your request is wrong":
 *
 *  - 429 / quota / RESOURCE_EXHAUSTED — rate limited
 *  - 503 / UNAVAILABLE / overloaded   — model temporarily saturated
 *  - 500 / INTERNAL                   — transient server fault
 *
 * The 503 case was the bug: it was absent, so an overloaded model threw straight out
 * of `withFallback` and the remaining healthy models were never tried. Observed live —
 * the then-default `gemini-flash-latest` returned 503 while two configured fallbacks
 * answered normally, which failed every analysis.
 *
 * Deliberately NOT retried: 400 (malformed request) and JSON.parse failures. Those are
 * our bug, not the model's, and retrying the same input elsewhere just burns quota.
 *
 * Exported (rather than a private method) so it can be tested without an API key.
 */
export function isRetryableModelError(error: unknown): boolean {
    const err = error as { status?: number; message?: unknown } | null | undefined;
    const status = err?.status;
    const message = String(err?.message ?? '').toLowerCase();

    if (status === 429 || status === 503 || status === 500) return true;

    return [
        '429',
        'quota',
        'rate limit',
        'resource_exhausted',
        '503',
        'unavailable',
        'overloaded',
        'currently experiencing',
        '500',
        'internal',
    ].some((needle) => message.includes(needle));
}

export class GeminiAiProvider implements AiProvider {
    private genAI: GoogleGenerativeAI;

    constructor() {
        if (!config.GEMINI_API_KEY) {
            throw new Error('GEMINI_API_KEY is not set');
        }
        this.genAI = new GoogleGenerativeAI(config.GEMINI_API_KEY);
    }

    // ─── Shared fallback helper ───────────────────────────────────────
    /**
     * Runs `fn` with the requested model first, then falls back through
     * GEMINI_FALLBACK_MODELS on transient server-side errors.
     */
    private async withFallback<T>(
        requestedModel: string,
        fn: (modelName: string) => Promise<T>,
        label: string,
    ): Promise<{ result: T; modelUsed: string }> {
        // Build ordered list: requested model first, then remaining fallbacks
        const models = [
            requestedModel,
            ...GEMINI_FALLBACK_MODELS.filter((m) => m !== requestedModel),
        ];

        let lastError: any;

        for (const modelName of models) {
            try {
                const result = await fn(modelName);
                if (modelName !== requestedModel) {
                    console.log(
                        `[Gemini AI] ✅ ${label} completed with fallback model "${modelName}" (originally "${requestedModel}")`,
                    );
                }
                return { result, modelUsed: modelName };
            } catch (error: any) {
                lastError = error;
                if (isRetryableModelError(error)) {
                    console.warn(
                        `[Gemini AI] ⚠️ Model "${modelName}" unavailable during ${label} ` +
                        `(${error?.status ?? 'unknown status'}), trying next...`,
                    );
                    continue; // try next model
                }
                // Our fault, not the model's (400, bad JSON) — retrying won't help.
                throw error;
            }
        }

        // All models exhausted
        console.error(`[Gemini AI] ❌ All models exhausted during ${label}`);
        throw new AppError(
            ERROR_CODES.INTERNAL_ERROR,
            'All AI models are currently busy. Please wait a few minutes and try again.',
            503,
            lastError,
        );
    }

    // ─── Public API ───────────────────────────────────────────────────
    async analyzeOffer(text: string, context?: OfferContext, model?: string): Promise<AnalysisResult> {
        const requestedModel = model || DEFAULT_GEMINI_MODEL;
        console.log(`[Gemini AI] Starting analysis with model: ${requestedModel}`);

        try {
            const { result, modelUsed } = await this.withFallback(
                requestedModel,
                async (modelName) => {
                    const analysisModel = this.genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            responseMimeType: 'application/json',
                            // Enforced at the model, so the reply is structurally correct
                            // before we see it. Without this the model invented its own
                            // key names on every request — 16 different shapes across 16
                            // eval cases, none of which this code could read.
                            responseSchema: GEMINI_RESPONSE_SCHEMA,
                            temperature: 0.2,
                            maxOutputTokens: 8192,
                        },
                        systemInstruction: SYSTEM_INSTRUCTION,
                    });

                    return this.generateValidated(analysisModel, buildAnalysisPrompt(text, context));
                },
                'analysis',
            );

            // Stamp the model that actually served the request. This was previously left as
            // the literal string 'unknown' because the AI was asked to report it itself.
            result.metadata.modelUsed = modelUsed;
            return result as AnalysisResult;
        } catch (error: any) {
            if (error instanceof AppError) throw error;

            console.error('[Gemini AI] Analysis failed:', error);

            if (error.message?.includes('400') || error.status === 400) {
                throw new AppError(
                    ERROR_CODES.INTERNAL_ERROR,
                    'Invalid request to AI model. Please try a different model.',
                    400,
                    error,
                );
            }

            throw new AppError(
                ERROR_CODES.INTERNAL_ERROR,
                'AI analysis failed: ' + (error.message || 'Unknown error'),
                500,
                error,
            );
        }
    }

    async extractMetadata(text: string): Promise<any> {
        const prompt = `
            Extract the following fields from the offer letter text:
            - Role / Job Title
            - City / Location
            - Experience Level (choose from: "Fresher (0-1 yrs)", "Junior (1-3 yrs)", "Mid-Level (3-5 yrs)", "Senior (5-8 yrs)", "Staff/Lead (8-12 yrs)", "Principal/Director (12+ yrs)")
            - Current CTC (if mentioned, number only)
            - Currency (e.g. INR, USD)

            Output JSON with these exact keys: "role", "city", "experienceLevel", "currentCtc" (number), "currency".
            For experienceLevel, use one of the exact values listed above based on years of experience or job title.
            Return null for fields not found. Do not invent data.

            Text:
            """${text.substring(0, 10000)}"""
        `;

        try {
            const { result } = await this.withFallback(
                'gemini-flash-lite-latest',
                async (modelName) => {
                    const model = this.genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.3,
                            maxOutputTokens: 2048,
                        },
                    });

                    const genResult = await model.generateContent(prompt);
                    const response = await genResult.response;
                    const jsonString = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
                    return JSON.parse(jsonString);
                },
                'metadata extraction',
            );

            return result;
        } catch (error) {
            console.error('[Gemini AI] ❌ Metadata extraction failed:', error);
            return {};
        }
    }

    async generateCareerPath(input: { role: string; companyType: string; industry: string }): Promise<any> {
        const industry = input.industry && input.industry !== 'Unknown'
            ? `the ${input.industry} industry`
            : 'their industry';
        const companyContext = input.companyType && input.companyType !== 'Unknown'
            ? ` at a ${input.companyType} company`
            : '';

        const prompt = `
            Act as a career counselor.
            Create a 5-year career trajectory for a ${input.role} in ${industry}${companyContext}.

            Ground the progression in that specific field. Do not default to a software
            engineering ladder unless the role is actually in software.

            Output JSON with this structure:
            {
                "timeline": [
                    { "year": 1, "title": "...", "focus": "...", "salaryRange": "..." },
                    { "year": 3, "title": "...", "focus": "...", "salaryRange": "..." },
                    { "year": 5, "title": "...", "focus": "...", "salaryRange": "..." }
                ],
                "skillsToLearn": ["...", "..."],
                "potentialRoles": ["...", "..."]
            }
            
            Do not acknowledge or explain, just output valid JSON.
        `;

        try {
            const { result } = await this.withFallback(
                'gemini-flash-latest',
                async (modelName) => {
                    const model = this.genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.3,
                            maxOutputTokens: 8192,
                        },
                    });

                    const genResult = await model.generateContent(prompt);
                    const response = await genResult.response;
                    const text = response.text();
                    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    return JSON.parse(jsonStr);
                },
                'career path generation',
            );

            return result;
        } catch (error) {
            console.error('[Gemini AI] Career path generation failed:', error);
            return {
                timeline: [],
                skillsToLearn: [],
                potentialRoles: [],
                error: 'Failed to generate career path',
            };
        }
    }

    async generateNegotiationScript(input: any): Promise<{ subject: string; body: string }> {
        const prompt = `
            Act as a professional career coach and negotiation expert.
            Write a negotiation email for a job offer.

            Context:
            - Company: ${input.companyName}
            - Role: ${input.role}
            - Tone: ${input.tone} (professional, assertive, or friendly)
            - Focus Areas: ${input.focusAreas?.join(', ') || 'General compensation and benefits'}
            
            Offer Details:
            ${JSON.stringify(input.currentOffer, null, 2)}

            Market Data:
            ${JSON.stringify(input.marketData, null, 2)}

            Negotiation Points to Include:
            ${JSON.stringify(input.suggestions, null, 2)}

            Output JSON with keys: "subject" and "body".
            The body should be the email content, ready to send (with placeholders for name if needed).
        `;

        try {
            const { result } = await this.withFallback(
                'gemini-flash-latest',
                async (modelName) => {
                    const model = this.genAI.getGenerativeModel({
                        model: modelName,
                        generationConfig: {
                            responseMimeType: 'application/json',
                            temperature: 0.3,
                            maxOutputTokens: 8192,
                        },
                    });

                    const genResult = await model.generateContent(prompt);
                    const response = await genResult.response;
                    const text = response.text();
                    const jsonStr = text.replace(/```json/g, '').replace(/```/g, '').trim();
                    return JSON.parse(jsonStr) as { subject: string; body: string };
                },
                'negotiation script',
            );

            return result;
        } catch (error) {
            console.error('[Gemini AI] Negotiation script generation failed:', error);
            return {
                subject: `Negotiation regarding ${input.role} offer`,
                body: `Dear Hiring Manager,\n\nI am writing to discuss... [AI generation failed, please use template]`,
            };
        }
    }

    /**
     * Generate, then validate with Zod. One retry, with the validation errors fed back.
     *
     * Previously the response was `JSON.parse`d and trusted. A parse failure was not a
     * rate-limit error, so `withFallback` rethrew immediately and no retry happened at
     * all — contradicting the roadmap's "retry once with a stricter prompt".
     */
    private async generateValidated(
        model: GenerativeModel,
        prompt: string,
    ): Promise<ValidatedAnalysis> {
        let lastIssue = '';

        for (let attempt = 1; attempt <= 2; attempt++) {
            const promptForAttempt = attempt === 1
                ? prompt
                : `${prompt}\n\nYour previous response was rejected by validation:\n${lastIssue}\n`
                  + 'Return the corrected JSON. Use exactly the field names in the schema.';

            const genResult = await model.generateContent(promptForAttempt);
            const raw = genResult.response.text();

            let parsed: unknown;
            try {
                parsed = JSON.parse(raw);
            } catch (err: any) {
                lastIssue = `Response was not valid JSON: ${err.message}`;
                console.warn(`[Gemini AI] attempt ${attempt}: ${lastIssue}`);
                continue;
            }

            const validation = analysisResultSchema.safeParse(parsed);
            if (validation.success) {
                if (attempt > 1) console.log('[Gemini AI] ✅ validation passed on retry');
                return validation.data;
            }

            lastIssue = validation.error.issues
                .slice(0, 8)
                .map((i) => `- ${i.path.join('.') || '(root)'}: ${i.message}`)
                .join('\n');
            console.warn(`[Gemini AI] attempt ${attempt} failed validation:\n${lastIssue}`);
        }

        // Both attempts failed. Throwing marks the offer FAILED, which is correct — an
        // empty analysis presented as a confident score is worse than a visible failure.
        throw new AppError(
            ERROR_CODES.INTERNAL_ERROR,
            'Analysis could not be completed. Please try again.',
            500,
            lastIssue,
        );
    }
}
