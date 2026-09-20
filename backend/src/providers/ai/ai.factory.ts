import { config } from '@/config/index.js';
import { AiProvider } from './ai.provider.js';
import { GeminiAiProvider } from './gemini.ai.js';
import { OpenAiProvider } from './openai.ai.js';
import { AnthropicAiProvider } from './anthropic.ai.js';
import { MockAiProvider } from './mock.ai.js';
import type { AiProviderName } from './usage.js';

/**
 * Build an AI provider per call, instead of once at boot.
 *
 * It used to be a singleton created in the Fastify plugin and a second one in the worker.
 * That made the provider, the model and the API key fixed for the lifetime of the process,
 * so trying another provider meant editing `.env` and restarting — and any future
 * bring-your-own-key feature was impossible by construction.
 *
 * Instances are cheap: the vendor SDKs are thin HTTP clients and hold no connection state,
 * so there is nothing to pool. `ponytail:` if profiling ever shows construction cost,
 * memoise on `provider + model + key-hash` — but do NOT key on the API key itself, since
 * that would put user credentials in a long-lived map.
 */

export interface AiProviderSelection {
    provider?: AiProviderName;
    /** Overrides the provider's own default model when set. */
    model?: string;
    /** Overrides the server-configured key. The route of a future BYOK feature. */
    apiKey?: string;
}

/** The provider name and model that would be used, for logging without building anything. */
export function describeSelection(selection: AiProviderSelection = {}): string {
    const provider = selection.provider ?? config.AI_PROVIDER;
    return `${provider}${selection.model ? `/${selection.model}` : ''}${selection.apiKey ? ' (caller key)' : ''}`;
}

/**
 * Does the server have a key for this provider?
 *
 * Used to decide whether to fall back to the mock rather than throwing at startup.
 */
export function hasServerKeyFor(provider: AiProviderName): boolean {
    switch (provider) {
        case 'gemini': return Boolean(config.GEMINI_API_KEY);
        case 'openai': return Boolean(config.OPENAI_API_KEY);
        case 'anthropic': return Boolean(config.ANTHROPIC_API_KEY);
        case 'mock': return true;
    }
}

export function createAiProvider(selection: AiProviderSelection = {}): AiProvider {
    const requested = selection.provider ?? config.AI_PROVIDER;

    // A caller-supplied key means the caller chose the provider deliberately, so respect it
    // even if the server has no key of its own. Otherwise, with no key anywhere, fall back to
    // the mock — the same behaviour as before, and it keeps local development working without
    // credentials rather than failing every request at the boundary.
    if (!selection.apiKey && !hasServerKeyFor(requested)) {
        console.warn(
            `[AI] No API key for "${requested}" — using MockAiProvider. `
            + 'Responses are fixed sample data, not analysis.',
        );
        return new MockAiProvider();
    }

    switch (requested) {
        case 'openai': return new OpenAiProvider(selection.apiKey, selection.model);
        case 'anthropic': return new AnthropicAiProvider(selection.apiKey, selection.model);
        case 'mock': return new MockAiProvider();
        case 'gemini':
        default: return new GeminiAiProvider(selection.apiKey, selection.model);
    }
}
