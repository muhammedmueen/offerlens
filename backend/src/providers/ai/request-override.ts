import { config } from '@/config/index.js';
import { AI_PROVIDERS } from '@/config/constants.js';
import type { AiProviderSelection } from './ai.factory.js';
import type { AiProviderName } from './usage.js';

/**
 * Per-request provider selection via `X-AI-*` headers. Development only.
 *
 * ── WHY ──────────────────────────────────────────────────────────────────────
 * Trying another provider or model used to mean editing `.env` and restarting both the API
 * and the worker. This makes it a header, so a request can name its provider, model and key.
 * It is also the plumbing a future bring-your-own-key feature needs — the expensive half of
 * BYOK is persisting a key safely, and none of that is here.
 *
 * ── WHY IT IS FENCED OFF ─────────────────────────────────────────────────────
 * An endpoint that accepts an arbitrary API key and an arbitrary model name is an abuse
 * vector, not a convenience:
 *
 *   - arbitrary model: a caller picks the most expensive model available and bills it to the
 *     server's key
 *   - arbitrary key: the server becomes a proxy that makes requests on someone else's
 *     credentials, with our IP on them
 *
 * So there are two independent gates, and BOTH must pass:
 *
 *   1. `NODE_ENV !== 'production'` — hardcoded, not configurable. Setting the env flag in
 *      production does not open it.
 *   2. `ALLOW_AI_REQUEST_OVERRIDE=true` — off by default, so a non-production deployment
 *      does not get it merely by not being production.
 *
 * Headers are ignored silently rather than rejected when the gates are shut. A 400 would
 * confirm to a prober that the feature exists; ignoring them looks like any other unknown
 * header.
 */

export const AI_OVERRIDE_HEADERS = {
    provider: 'x-ai-provider',
    model: 'x-ai-model',
    apiKey: 'x-ai-key',
} as const;

type Headers = Record<string, string | string[] | undefined>;

function firstValue(value: string | string[] | undefined): string | undefined {
    if (Array.isArray(value)) return value[0];
    return value ?? undefined;
}

/** Are per-request overrides permitted at all in this process? */
export function aiOverrideAllowed(): boolean {
    // Order matters only for readability; both conditions are required.
    return config.NODE_ENV !== 'production' && config.ALLOW_AI_REQUEST_OVERRIDE === true;
}

/**
 * Read an override out of request headers.
 *
 * Returns an empty selection when the gates are shut or no headers are present, so callers
 * can pass the result straight to `createAiProvider` without branching.
 */
export function resolveAiOverride(headers: Headers): AiProviderSelection {
    if (!aiOverrideAllowed()) return {};

    const rawProvider = firstValue(headers[AI_OVERRIDE_HEADERS.provider])?.trim().toLowerCase();
    const model = firstValue(headers[AI_OVERRIDE_HEADERS.model])?.trim();
    const apiKey = firstValue(headers[AI_OVERRIDE_HEADERS.apiKey])?.trim();

    const selection: AiProviderSelection = {};

    // Validated against the known list rather than cast. An unrecognised value falls through
    // to the configured default instead of reaching a provider constructor.
    if (rawProvider && (AI_PROVIDERS as readonly string[]).includes(rawProvider)) {
        selection.provider = rawProvider as AiProviderName;
    }
    if (model) selection.model = model;
    if (apiKey) selection.apiKey = apiKey;

    return selection;
}

/**
 * Strip anything secret before a selection is written somewhere that persists.
 *
 * Analysis is queued, so a selection travels to the worker inside a BullMQ job payload, and
 * BullMQ keeps completed job data for a while by default. A key left in there outlives the
 * request that supplied it. Use this anywhere a selection is logged or stored.
 */
export function redactSelection(selection: AiProviderSelection): AiProviderSelection {
    const { apiKey, ...rest } = selection;
    return apiKey ? { ...rest, apiKey: '[redacted]' } : rest;
}
