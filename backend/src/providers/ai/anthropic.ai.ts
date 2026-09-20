import Anthropic from '@anthropic-ai/sdk';
import { config } from '@/config/index.js';
import { ANTHROPIC_FALLBACK_MODELS, DEFAULT_ANTHROPIC_MODEL } from '@/config/constants.js';
import { BaseAiProvider, type AiTask, type CompletionRequest, type CompletionResult } from './base.ai.js';
import { toAnthropicSchema } from './response-schema.js';
import type { AiProviderName } from './usage.js';

/**
 * Which Anthropic failures mean "try another model".
 *
 * 429 rate limit, 500/502/503 transient faults, and 529 — Anthropic's own `overloaded_error`,
 * which is not a standard HTTP code and would be missed by a generic 5xx check.
 *
 * Exported so it is testable without an API key.
 */
export function isRetryableAnthropicError(error: unknown): boolean {
    const err = error as { status?: number; message?: unknown } | null | undefined;
    const status = err?.status;
    if (status === 429 || status === 500 || status === 502 || status === 503 || status === 529) return true;

    const message = String(err?.message ?? '').toLowerCase();
    return ['rate limit', 'rate_limit', 'overloaded', 'api_error', 'timeout']
        .some((needle) => message.includes(needle));
}

/**
 * Anthropic Claude.
 *
 * ── THE STRUCTURED-OUTPUT PROBLEM ────────────────────────────────────────────
 * Claude has no JSON mode. There is no `responseSchema` and no `json_object` — asking for
 * JSON in prose and parsing the reply is the naive route, and it is exactly what produced
 * the 16-different-shapes failure this codebase already fixed once.
 *
 * The reliable route is tool use. A single tool is declared whose input schema IS the
 * response shape, and `tool_choice` forces the model to call it. The arguments come back
 * already structured and schema-checked by Anthropic, so the "parse a model's prose" step
 * disappears. The base class expects text, so the tool input is re-serialised for it — a
 * round trip, but through data that is already valid rather than through a guess.
 *
 * Without a schema (metadata, career path, negotiation) it is an ordinary text call and the
 * base class's fence-tolerant parser handles the reply.
 */
export class AnthropicAiProvider extends BaseAiProvider {
    readonly name: AiProviderName = 'anthropic';
    protected readonly fallbackModels = ANTHROPIC_FALLBACK_MODELS;

    private client: Anthropic;

    constructor(apiKey?: string, model?: string) {
        super();
        const key = apiKey || config.ANTHROPIC_API_KEY;
        if (!key) throw new Error('ANTHROPIC_API_KEY is not set');
        this.client = new Anthropic({ apiKey: key });
        this.modelOverride = model || config.ANTHROPIC_MODEL;
    }

    protected modelFor(task: AiTask): string {
        return task === 'metadata'
            ? ANTHROPIC_FALLBACK_MODELS[ANTHROPIC_FALLBACK_MODELS.length - 1]
            : DEFAULT_ANTHROPIC_MODEL;
    }

    protected isRetryable(error: unknown): boolean {
        return isRetryableAnthropicError(error);
    }

    protected async complete(request: CompletionRequest): Promise<CompletionResult> {
        const toolName = request.schemaName ?? 'respond';

        const response = await this.client.messages.create({
            model: request.model,
            // Anthropic requires this rather than defaulting it.
            max_tokens: request.maxOutputTokens,
            temperature: request.temperature,
            ...(request.systemInstruction ? { system: request.systemInstruction } : {}),
            messages: [{ role: 'user', content: request.prompt }],
            ...(request.jsonSchema
                ? {
                    tools: [{
                        name: toolName,
                        description: 'Return the structured result using this schema.',
                        input_schema: toAnthropicSchema(request.jsonSchema) as Anthropic.Tool.InputSchema,
                    }],
                    // Without forcing the choice, Claude may answer in prose instead of
                    // calling the tool, which defeats the whole mechanism.
                    tool_choice: { type: 'tool' as const, name: toolName },
                }
                : {}),
        });

        const usage = {
            inputTokens: response.usage?.input_tokens ?? 0,
            outputTokens: response.usage?.output_tokens ?? 0,
        };

        // Prefer the tool call. Re-serialised because the base class parses text, and this
        // JSON came from a schema-checked object rather than from the model's prose.
        const toolUse = response.content.find((block) => block.type === 'tool_use');
        if (toolUse && toolUse.type === 'tool_use') {
            return { text: JSON.stringify(toolUse.input), ...usage };
        }

        const textBlocks = response.content
            .filter((block): block is Anthropic.TextBlock => block.type === 'text')
            .map((block) => block.text)
            .join('');

        return { text: textBlocks, ...usage };
    }
}
