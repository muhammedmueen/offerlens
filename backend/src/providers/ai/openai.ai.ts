import OpenAI from 'openai';
import { config } from '@/config/index.js';
import { OPENAI_FALLBACK_MODELS, DEFAULT_OPENAI_MODEL } from '@/config/constants.js';
import { BaseAiProvider, type AiTask, type CompletionRequest, type CompletionResult } from './base.ai.js';
import { toOpenAiSchema } from './response-schema.js';
import type { AiProviderName } from './usage.js';

/**
 * Which OpenAI failures mean "try another model" rather than "your request is wrong".
 *
 * 429 rate limit, 500/502/503 transient server faults. Not 400 (malformed request), not 401
 * (bad key) and not 404 (no such model) — retrying any of those elsewhere burns quota to
 * reach the same answer.
 *
 * Exported so it is testable without an API key.
 */
export function isRetryableOpenAiError(error: unknown): boolean {
    const err = error as { status?: number; message?: unknown } | null | undefined;
    const status = err?.status;
    if (status === 429 || status === 500 || status === 502 || status === 503) return true;

    const message = String(err?.message ?? '').toLowerCase();
    return ['rate limit', 'rate_limit', 'overloaded', 'server_error', 'try again', 'timeout']
        .some((needle) => message.includes(needle));
}

/**
 * OpenAI.
 *
 * Structured output uses `json_schema` with `strict: true`, which is the closest equivalent
 * to Gemini's `responseSchema` — the model is constrained rather than merely asked. Strict
 * mode is fussier, though: every object must list all of its properties in `required` and set
 * `additionalProperties: false`, or the API rejects the request outright rather than
 * degrading. `toOpenAiSchema` applies both.
 *
 * When no schema is supplied (metadata, career path, negotiation) it falls back to
 * `json_object` mode, which guarantees parseable JSON but not a particular shape — the same
 * trade the Gemini path makes for those calls.
 */
export class OpenAiProvider extends BaseAiProvider {
    readonly name: AiProviderName = 'openai';
    protected readonly fallbackModels = OPENAI_FALLBACK_MODELS;

    private client: OpenAI;

    constructor(apiKey?: string, model?: string) {
        super();
        const key = apiKey || config.OPENAI_API_KEY;
        if (!key) throw new Error('OPENAI_API_KEY is not set');
        this.client = new OpenAI({ apiKey: key });
        this.modelOverride = model || config.OPENAI_MODEL;
    }

    protected modelFor(task: AiTask): string {
        // Metadata is five fields; the cheapest model is enough. Everything else gets the
        // configured default.
        return task === 'metadata'
            ? OPENAI_FALLBACK_MODELS[OPENAI_FALLBACK_MODELS.length - 1]
            : DEFAULT_OPENAI_MODEL;
    }

    protected isRetryable(error: unknown): boolean {
        return isRetryableOpenAiError(error);
    }

    protected async complete(request: CompletionRequest): Promise<CompletionResult> {
        const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
        if (request.systemInstruction) {
            messages.push({ role: 'system', content: request.systemInstruction });
        }
        messages.push({ role: 'user', content: request.prompt });

        const response = await this.client.chat.completions.create({
            model: request.model,
            messages,
            temperature: request.temperature,
            // `max_tokens` is deprecated in favour of this for the current model families.
            max_completion_tokens: request.maxOutputTokens,
            response_format: request.jsonSchema
                ? {
                    type: 'json_schema',
                    json_schema: {
                        name: request.schemaName ?? 'response',
                        strict: true,
                        schema: toOpenAiSchema(request.jsonSchema) as Record<string, unknown>,
                    },
                }
                : { type: 'json_object' },
        });

        return {
            text: response.choices[0]?.message?.content ?? '',
            inputTokens: response.usage?.prompt_tokens ?? 0,
            outputTokens: response.usage?.completion_tokens ?? 0,
        };
    }
}
