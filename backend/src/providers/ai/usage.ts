/**
 * Token accounting for AI calls.
 *
 * Exists because nothing recorded what an analysis costs. Every provider returns usage
 * data on the response and it was thrown away, which makes any pricing or plan decision
 * guesswork — and a freemium tier priced on a guess is a freemium tier that loses money.
 *
 * ── TOKENS ARE AUTHORITATIVE, COST IS ADVISORY ───────────────────────────────
 * Token counts come from the provider and are exact. Cost is derived from a hardcoded
 * price table, which goes stale the moment a vendor changes rates — Google raised Gemini
 * prices in July 2026, and published figures for the newest models disagree between
 * sources. So:
 *
 *   - `inputTokens` / `outputTokens` — trust these, they came from the API.
 *   - `costUsd` — an estimate. `null` when the model is not in the table, never a guess.
 *
 * Use tokens for anything that has to be right (billing, quota, comparing providers).
 * Use cost for orientation.
 */

export type AiProviderName = 'gemini' | 'openai' | 'anthropic' | 'mock';

export interface TokenUsage {
    provider: AiProviderName;
    /** The model that actually served the request, not the one requested. */
    model: string;
    inputTokens: number;
    /**
     * Includes thinking/reasoning tokens where the vendor reports them separately. Gemini
     * breaks `thoughtsTokenCount` out of the candidate count, so the caller folds it back in
     * here; OpenAI and Anthropic already include reasoning in their output count. Keeping it
     * folded here keeps this type's shape and its cost correct.
     */
    outputTokens: number;
    totalTokens: number;
    /**
     * How many model calls this covers.
     *
     * Rarely 1. A validation retry or a fallback to another model each add a call, and each
     * one is billed. Reporting only the successful call would understate cost by whatever
     * the failed attempts consumed — which on a bad day is most of it.
     */
    calls: number;
    /** USD estimate, or null when the model is not in PRICING. */
    costUsd: number | null;
}

interface Price {
    inputPerMillion: number;
    outputPerMillion: number;
}

/**
 * USD per 1,000,000 tokens.
 *
 * Checked 19 Sep 2026 against vendor documentation and corroborating calculators:
 *   - Gemini: https://ai.google.dev/gemini-api/docs/pricing
 *   - OpenAI: https://openai.com/api/pricing/
 *   - Anthropic: https://platform.claude.com/docs/en/docs/about-claude/pricing
 *
 * Content was rephrased for compliance with licensing restrictions.
 *
 * VERIFY BEFORE QUOTING. Secondary sources disagreed on several current models, and rates
 * have moved more than once this year. A model absent from this table yields `costUsd:
 * null` rather than an invented figure — an absent cost is honest, a wrong one is not.
 */
export const PRICING: Record<string, Price> = {
    // ── Gemini ──
    // The flash line is priced at the standard flash rate; the lite line at the lite rate.
    // Prefix matching (priceFor) covers dated/newer flash ids that share these prefixes.
    'gemini-3.5-flash': { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    'gemini-flash-latest': { inputPerMillion: 0.30, outputPerMillion: 2.50 },
    'gemini-3.5-flash-lite': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    'gemini-flash-lite-latest': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    // The ≤200k-prompt tier, which covers every prompt this app sends. Above 200k Google
    // charges roughly double; we never reach it. Corroborated by secondary calculators, so
    // the table-wide VERIFY warning applies here especially.
    'gemini-2.5-pro': { inputPerMillion: 1.25, outputPerMillion: 10.00 },
    // A moving alias. It currently points at 2.5 Pro, so it is priced the same — but the
    // target may since have moved to a newer Pro at a different rate. Re-check on drift.
    'gemini-pro-latest': { inputPerMillion: 1.25, outputPerMillion: 10.00 },

    // ── OpenAI ──
    'gpt-4.1': { inputPerMillion: 2.00, outputPerMillion: 8.00 },
    'gpt-4.1-mini': { inputPerMillion: 0.40, outputPerMillion: 1.60 },
    'gpt-4.1-nano': { inputPerMillion: 0.10, outputPerMillion: 0.40 },
    'gpt-4o-mini': { inputPerMillion: 0.15, outputPerMillion: 0.60 },

    // ── Anthropic ──
    'claude-haiku-4-5': { inputPerMillion: 1.00, outputPerMillion: 5.00 },
    'claude-sonnet-4-5': { inputPerMillion: 3.00, outputPerMillion: 15.00 },
};

/**
 * Resolve a model id to a price, tolerating the dated suffixes vendors append.
 *
 * Anthropic ships ids like `claude-haiku-4-5-20251001`; OpenAI ships `gpt-4.1-mini-2025-04-14`.
 * An exact-match-only table would silently report null for every real call.
 */
function priceFor(model: string): Price | null {
    if (PRICING[model]) return PRICING[model];

    // Longest prefix wins, so `claude-sonnet-4-5` is not matched by a shorter `claude`.
    const candidates = Object.keys(PRICING)
        .filter((key) => model.startsWith(key))
        .sort((a, b) => b.length - a.length);

    return candidates.length > 0 ? PRICING[candidates[0]] : null;
}

/**
 * Which vendor a model id belongs to, by prefix. `null` when the prefix is not recognised.
 *
 * Exists so a provider can notice it has been handed another vendor's model id. That is not
 * hypothetical: the enqueue path used to default `model` to `DEFAULT_GEMINI_MODEL`, so
 * selecting OpenAI or Anthropic handed the adapter a Gemini id like "gemini-3.5-flash". Neither vendor's
 * invalid-model error is classified as retryable — correctly, since retrying a wrong request
 * elsewhere only burns quota — so the fallback chain was never tried and the analysis failed
 * outright, with nothing in the log naming the cause.
 *
 * Deliberately fails OPEN: an unrecognised prefix returns null and the caller must treat that
 * as "no objection". A vendor shipping an id in a new format should not have it rejected
 * here, so the only ids this can veto are ones that positively match a DIFFERENT vendor.
 */
const VENDOR_PREFIXES: ReadonlyArray<readonly [string, AiProviderName]> = [
    ['gemini-', 'gemini'],
    ['gpt-', 'openai'],
    ['o1-', 'openai'],
    ['o3-', 'openai'],
    ['o4-', 'openai'],
    ['claude-', 'anthropic'],
];

export function modelVendor(model: string): AiProviderName | null {
    const hit = VENDOR_PREFIXES.find(([prefix]) => model.startsWith(prefix));
    return hit ? hit[1] : null;
}

/**
 * USD per image for Cloud Vision `TEXT_DETECTION`.
 *
 * ponytail: list-price estimate. $1.50 per 1,000 units for units 1,001–5,000,000 per month
 * (https://cloud.google.com/vision/pricing). It ignores the free first 1,000 units/month and
 * the cheaper >5M tier, so it slightly over-states cost at low volume. Upgrade path: track
 * the running monthly unit count and pick the tier, or read actual spend from billing export.
 */
export const VISION_TEXT_DETECTION_USD_PER_IMAGE = 0.0015;

/**
 * USD per page for Azure AI Document Intelligence `prebuilt-read`.
 *
 * ponytail: list-price estimate. Read is ≈ $1.50 per 1,000 pages for the first 1M pages/month
 * (https://azure.microsoft.com/en-in/pricing/details/document-intelligence/), i.e. $0.0015/page.
 * Unlike Vision (billed per image), Azure bills per PAGE, so a multi-page scan costs
 * `pageCount × this`. It ignores the cheaper >1M tier, which this app never reaches. Upgrade
 * path: read actual spend from the Azure Cost Management export rather than this table.
 */
export const AZURE_READ_USD_PER_PAGE = 0.0015;

export function estimateCostUsd(model: string, inputTokens: number, outputTokens: number): number | null {
    const price = priceFor(model);
    if (!price) return null;

    const cost = (inputTokens / 1_000_000) * price.inputPerMillion
        + (outputTokens / 1_000_000) * price.outputPerMillion;

    // Six decimals: a single analysis costs fractions of a cent, and rounding to four
    // would report most calls as 0.0000.
    return Number(cost.toFixed(6));
}

export function emptyUsage(provider: AiProviderName, model: string): TokenUsage {
    return { provider, model, inputTokens: 0, outputTokens: 0, totalTokens: 0, calls: 0, costUsd: null };
}

/**
 * Accumulate one call onto a running total.
 *
 * `model` takes the latest value rather than the first, so after a fallback the usage
 * names the model that actually answered.
 *
 * ── COST IS SUMMED PER CALL, AT THE CALL'S OWN MODEL ──────────────────────────
 * The previous version recomputed cost from the CUMULATIVE token totals at the LATEST
 * model's price. That mispriced every fallback chain: a flash call then a lite call billed
 * both at the lite rate, so flash's tokens were under- or over-charged. Each call is now
 * priced on the model that actually served it and summed. If either the running total or
 * this call's cost is unknown (model absent from PRICING), the sum is `null` rather than a
 * guess — an honest unknown, never an invented figure.
 */
export function addCall(
    running: TokenUsage,
    call: { model?: string; inputTokens: number; outputTokens: number },
): TokenUsage {
    const model = call.model ?? running.model;
    const inputTokens = running.inputTokens + (call.inputTokens || 0);
    const outputTokens = running.outputTokens + (call.outputTokens || 0);

    const callCost = estimateCostUsd(model, call.inputTokens || 0, call.outputTokens || 0);
    let costUsd: number | null;
    if (running.calls === 0) {
        // First call: there is no prior cost to add, so take this call's cost as-is.
        costUsd = callCost;
    } else if (running.costUsd === null || callCost === null) {
        // Any unknown anywhere in the chain makes the total unknown.
        costUsd = null;
    } else {
        costUsd = Number((running.costUsd + callCost).toFixed(6));
    }

    return {
        provider: running.provider,
        model,
        inputTokens,
        outputTokens,
        totalTokens: inputTokens + outputTokens,
        calls: running.calls + 1,
        costUsd,
    };
}

// ─── Ledger types ────────────────────────────────────────────────────────────
//
// Pure types and one guard, kept here so `usage.ts` is the single source of the purpose
// list (base.ai.ts derives AiTask from it) and so the provider layer can record without
// importing anything from the db or modules layer. The DB write itself lives in
// `modules/usage/usage-ledger.ts`.

/** Every billable thing we meter. `'ocr'` is Vision; the rest are AI text tasks. */
export type UsagePurpose = 'analysis' | 'metadata' | 'career' | 'negotiation' | 'ocr';

/**
 * Who pays for a call.
 *  - `'platform'`   — the server's own key.
 *  - `'caller_key'` — a caller-supplied key (the dev X-AI-Key override / future BYOK).
 *  - `'mock'`       — the mock provider; no real spend.
 */
export type BilledTo = 'platform' | 'caller_key' | 'mock';

/** Caller identity attached to each row. All nullable: guests and unattributed calls exist. */
export interface UsageContext {
    userId?: string | null;
    guestId?: string | null;
    offerId?: string | null;
}

/** One metered call, as the provider layer reports it (before context/billedTo are attached). */
export interface UsageEvent {
    purpose: UsagePurpose;
    provider: string;
    model: string;
    inputTokens: number;
    outputTokens: number;
    thinkingTokens: number;
    /** Per-image billing (Vision). `null` for token-billed AI calls. */
    units: number | null;
    costUsd: number | null;
    success: boolean;
    /** Short machine code, NO PII and NO offer text. `null` on success. */
    errorCode: string | null;
}

export type UsageRecorder = (event: UsageEvent) => Promise<void>;

/**
 * Run a recorder without ever letting it break the caller.
 *
 * Writing a ledger row must never fail a user's request or a job, so every recorder call
 * goes through here: it awaits the recorder inside try/catch and logs failures loudly
 * (never silently swallowed, never with offer text). Awaited rather than fire-and-forget so
 * rows land deterministically and tests can assert on them. A `null` recorder is a no-op,
 * which is how unmetered call sites (the eval harness, the boot instance) opt out.
 */
export async function recordSafely(
    recorder: UsageRecorder | null | undefined,
    event: UsageEvent,
): Promise<void> {
    if (!recorder) return;
    try {
        await recorder(event);
    } catch (err) {
        console.error(
            `[UsageLedger] failed to record ${event.purpose} ${event.provider}/${event.model}: `
            + `${(err as Error)?.message ?? String(err)}`,
        );
    }
}

/** One-line form for logs. */
export function formatUsage(usage: TokenUsage): string {
    const cost = usage.costUsd === null ? 'cost unknown' : `$${usage.costUsd.toFixed(6)}`;
    return `${usage.provider}/${usage.model} — ${usage.inputTokens} in + ${usage.outputTokens} out `
        + `= ${usage.totalTokens} tokens across ${usage.calls} call(s), ${cost}`;
}
