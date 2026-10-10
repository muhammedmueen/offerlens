import { GoogleGenerativeAI } from '@google/generative-ai';
import { config } from '@/config/index.js';
import { GEMINI_FALLBACK_MODELS, DEFAULT_GEMINI_MODEL } from '@/config/constants.js';
import { BaseAiProvider, type AiTask, type CompletionRequest, type CompletionResult } from './base.ai.js';
import type { AiProviderName } from './usage.js';

// Re-exported so existing imports keep working. The implementation moved out of this file
// because it is prompt text that applies to every provider, not something Gemini-specific.
export { describeMarketData } from './market-data.js';

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

/**
 * Google Gemini.
 *
 * Everything shared — prompts, Zod validation and its one retry, the fallback walk, token
 * accounting — lives in `BaseAiProvider`. What remains here is the SDK call and the
 * vendor's own quirks.
 *
 * Gemini takes the response schema most directly of the three: `responseSchema` accepts the
 * canonical declaration as-is, with no conversion, because that declaration is written in
 * Gemini's `Schema` form.
 */
export class GeminiAiProvider extends BaseAiProvider {
    readonly name: AiProviderName = 'gemini';
    protected readonly fallbackModels = GEMINI_FALLBACK_MODELS;

    private genAI: GoogleGenerativeAI;

    constructor(apiKey?: string, model?: string) {
        super();
        // The explicit key is what makes a per-request provider possible; falling back to
        // config keeps the server-configured default working.
        const key = apiKey || config.GEMINI_API_KEY;
        if (!key) throw new Error('GEMINI_API_KEY is not set');
        this.genAI = new GoogleGenerativeAI(key);
        this.modelOverride = model || config.GEMINI_MODEL;
    }

    protected modelFor(task: AiTask): string {
        // Metadata extraction is five fields and runs on the cheapest model; the other
        // generative tasks do not need the strongest either. Only analysis gets the default.
        switch (task) {
            case 'analysis': return DEFAULT_GEMINI_MODEL;
            case 'metadata': return 'gemini-flash-lite-latest';
            default: return 'gemini-flash-latest';
        }
    }

    protected isRetryable(error: unknown): boolean {
        return isRetryableModelError(error);
    }

    protected async complete(request: CompletionRequest): Promise<CompletionResult> {
        const model = this.genAI.getGenerativeModel({
            model: request.model,
            generationConfig: {
                responseMimeType: 'application/json',
                // Enforced at the model, so the reply is structurally correct before we see
                // it. Without this the model invented its own key names on every request —
                // 16 different shapes across 16 eval cases, none of which this code read.
                ...(request.jsonSchema ? { responseSchema: request.jsonSchema } : {}),
                temperature: request.temperature,
                maxOutputTokens: request.maxOutputTokens,
            },
            ...(request.systemInstruction ? { systemInstruction: request.systemInstruction } : {}),
        });

        const generated = await model.generateContent(request.prompt);
        const usage = readGeminiUsage(generated.response.usageMetadata);

        return {
            text: generated.response.text(),
            ...usage,
        };
    }
}

/**
 * Read Gemini's token counts defensively.
 *
 * `thoughtsTokenCount` is reasoning ("thinking") tokens, billed at the output rate. It is not
 * in the `@google/generative-ai` 0.24.1 type for `usageMetadata`, and it is absent on models
 * or requests that do no thinking — so it is read off an `unknown` and any missing or
 * non-finite value becomes 0. `promptTokenCount` and `candidatesTokenCount` are the input and
 * output counts; `candidatesTokenCount` does NOT include the thinking tokens.
 *
 * Exported (not inlined) so it can be unit-tested without an API key.
 */
export function readGeminiUsage(
    meta: unknown,
): { inputTokens: number; outputTokens: number; thinkingTokens: number } {
    const m = (meta ?? {}) as Record<string, unknown>;
    const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
    return {
        inputTokens: num(m.promptTokenCount),
        outputTokens: num(m.candidatesTokenCount),
        thinkingTokens: num(m.thoughtsTokenCount),
    };
}
