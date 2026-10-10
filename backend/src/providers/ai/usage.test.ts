import { describe, it, expect, vi } from 'vitest';
import {
    estimateCostUsd, emptyUsage, addCall, formatUsage, modelVendor, PRICING,
    recordSafely, VISION_TEXT_DETECTION_USD_PER_IMAGE, type UsageEvent,
} from './usage.js';
import {
    DEFAULT_GEMINI_MODEL, DEFAULT_OPENAI_MODEL, DEFAULT_ANTHROPIC_MODEL,
} from '@/config/constants.js';

describe('estimateCostUsd', () => {
    it('prices a known model from the table', () => {
        // gemini-2.5-flash: $0.30/M in, $2.50/M out.
        // 1,000,000 in + 1,000,000 out = 0.30 + 2.50
        expect(estimateCostUsd('gemini-2.5-flash', 1_000_000, 1_000_000)).toBeCloseTo(2.80, 6);
    });

    it('matches a dated model id by prefix', () => {
        // Vendors append release dates: claude-haiku-4-5-20251001, gpt-4.1-mini-2025-04-14.
        // Exact-match-only would report null for every real call.
        expect(estimateCostUsd('claude-haiku-4-5-20251001', 1_000_000, 0)).toBeCloseTo(1.00, 6);
        expect(estimateCostUsd('gpt-4.1-mini-2025-04-14', 1_000_000, 0)).toBeCloseTo(0.40, 6);
    });

    it('prefers the longest matching prefix', () => {
        // 'claude-sonnet-4-5' must not be priced as some shorter 'claude' entry.
        expect(estimateCostUsd('claude-sonnet-4-5-20250929', 1_000_000, 0)).toBeCloseTo(3.00, 6);
    });

    it('returns null for an unknown model rather than guessing', () => {
        // An absent cost is honest. An invented one silently corrupts every pricing decision
        // built on top of it.
        expect(estimateCostUsd('gemini-9.9-imaginary', 1_000_000, 1_000_000)).toBeNull();
        expect(estimateCostUsd('', 100, 100)).toBeNull();
    });

    it('keeps enough precision for a single analysis', () => {
        // A real analysis is a few thousand tokens and costs fractions of a cent. Rounding
        // to four places would report it as 0.0000.
        const cost = estimateCostUsd('gemini-2.5-flash', 4_000, 1_500);
        expect(cost).not.toBeNull();
        expect(cost).toBeGreaterThan(0);
        expect(cost!).toBeLessThan(0.01);
    });
});

describe('addCall', () => {
    it('accumulates tokens and counts every call', () => {
        // Retries and fallbacks are billed too. Counting only the successful call would
        // understate cost by whatever the failed attempts consumed.
        let usage = emptyUsage('gemini', 'gemini-2.5-flash');
        usage = addCall(usage, { inputTokens: 1000, outputTokens: 200 });
        usage = addCall(usage, { inputTokens: 1100, outputTokens: 250 });

        expect(usage.calls).toBe(2);
        expect(usage.inputTokens).toBe(2100);
        expect(usage.outputTokens).toBe(450);
        expect(usage.totalTokens).toBe(2550);
    });

    it('reports the model that actually answered after a fallback, priced PER model', () => {
        // The bug this replaces: cost used to be recomputed from the cumulative tokens at the
        // LATEST model's price, so flash's tokens were billed at the lite rate. Now each call
        // is priced on its own model and the costs are summed.
        let usage = emptyUsage('gemini', 'gemini-2.5-flash');
        usage = addCall(usage, { model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 100 });
        usage = addCall(usage, { model: 'gemini-flash-lite-latest', inputTokens: 50, outputTokens: 0 });

        expect(usage.model).toBe('gemini-flash-lite-latest');
        const expected =
            (100 / 1e6) * 0.30 + (100 / 1e6) * 2.50 // flash input + output
            + (50 / 1e6) * 0.10;                     // lite input
        expect(usage.costUsd).toBeCloseTo(expected, 9);
    });

    it('makes the whole chain cost null when any one model is unpriced', () => {
        // A known model followed by an unknown one: we cannot sum what we cannot price, so the
        // total is null rather than a partial guess.
        let usage = emptyUsage('gemini', 'gemini-2.5-flash');
        usage = addCall(usage, { model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 100 });
        usage = addCall(usage, { model: 'totally-unknown-model', inputTokens: 50, outputTokens: 50 });
        expect(usage.costUsd).toBeNull();
    });

    it('tolerates a provider that reports no token counts', () => {
        let usage = emptyUsage('mock', 'mock');
        usage = addCall(usage, { inputTokens: undefined as never, outputTokens: undefined as never });
        expect(usage.totalTokens).toBe(0);
        expect(usage.calls).toBe(1);
    });

    it('starts empty with no cost claimed', () => {
        const usage = emptyUsage('openai', 'gpt-4.1-mini');
        expect(usage.calls).toBe(0);
        expect(usage.totalTokens).toBe(0);
        expect(usage.costUsd).toBeNull();
    });
});

describe('PRICING table', () => {
    it('has no zero or negative rates', () => {
        // A zero rate reads as "free" and would hide real spend.
        for (const [model, price] of Object.entries(PRICING)) {
            expect(price.inputPerMillion, model).toBeGreaterThan(0);
            expect(price.outputPerMillion, model).toBeGreaterThan(0);
        }
    });

    it('covers the default model and the whole Gemini fallback chain', async () => {
        // A dead entry here means the common path silently reports cost unknown.
        const { GEMINI_FALLBACK_MODELS } = await import('@/config/constants.js');
        for (const model of GEMINI_FALLBACK_MODELS) {
            expect(estimateCostUsd(model, 1000, 100), model).not.toBeNull();
        }
    });
});

describe('formatUsage', () => {
    it('says "cost unknown" rather than printing a zero', () => {
        expect(formatUsage(emptyUsage('mock', 'mock'))).toContain('cost unknown');
    });

    it('includes tokens and call count', () => {
        let usage = emptyUsage('gemini', 'gemini-2.5-flash');
        usage = addCall(usage, { inputTokens: 1000, outputTokens: 200 });
        const line = formatUsage(usage);
        expect(line).toContain('1000 in');
        expect(line).toContain('200 out');
        expect(line).toContain('1 call');
    });
});

describe('modelVendor', () => {
    it('recognises each vendor by prefix', () => {
        expect(modelVendor('gemini-2.5-flash')).toBe('gemini');
        expect(modelVendor('gpt-4.1-mini')).toBe('openai');
        expect(modelVendor('o3-mini')).toBe('openai');
        expect(modelVendor('claude-sonnet-4-5-20250929')).toBe('anthropic');
    });

    it('fails open on an unrecognised prefix', () => {
        // The caller treats null as "no objection". A vendor shipping an id in a new format
        // must not have it vetoed here — the only ids this can reject are ones that
        // positively match a different vendor.
        expect(modelVendor('some-future-model-v9')).toBeNull();
        expect(modelVendor('')).toBeNull();
    });

    it('classifies every model in the pricing table', () => {
        // Keeps the two tables honest with each other: a priced model whose vendor cannot be
        // determined would be silently ignored by resolveModel on its own provider.
        for (const model of Object.keys(PRICING)) {
            expect(modelVendor(model), model).not.toBeNull();
        }
    });

    it('agrees with the configured default for each provider', () => {
        // The bug this guard exists for: DEFAULT_GEMINI_MODEL was being handed to whichever
        // provider ran. If any of these three drifted to an unrecognised prefix, the guard
        // would stop protecting that provider without any test failing.
        expect(modelVendor(DEFAULT_GEMINI_MODEL)).toBe('gemini');
        expect(modelVendor(DEFAULT_OPENAI_MODEL)).toBe('openai');
        expect(modelVendor(DEFAULT_ANTHROPIC_MODEL)).toBe('anthropic');
    });
});

describe('ledger pricing additions', () => {
    it('prices gemini-2.5-pro and gemini-pro-latest to a non-null figure', () => {
        expect(estimateCostUsd('gemini-2.5-pro', 1000, 100)).not.toBeNull();
        expect(estimateCostUsd('gemini-pro-latest', 1000, 100)).not.toBeNull();
    });

    it('has a positive Vision per-image price', () => {
        expect(VISION_TEXT_DETECTION_USD_PER_IMAGE).toBeGreaterThan(0);
    });
});

describe('recordSafely', () => {
    const event: UsageEvent = {
        purpose: 'analysis', provider: 'gemini', model: 'gemini-2.5-flash',
        inputTokens: 1, outputTokens: 1, thinkingTokens: 0, units: null,
        costUsd: 0, success: true, errorCode: null,
    };

    it('swallows a recorder that rejects, logging once', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(
            recordSafely(async () => { throw new Error('db down'); }, event),
        ).resolves.toBeUndefined();
        expect(errSpy).toHaveBeenCalledTimes(1);
        errSpy.mockRestore();
    });

    it('swallows a recorder that throws synchronously, logging once', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(
            recordSafely((() => { throw new Error('boom'); }) as never, event),
        ).resolves.toBeUndefined();
        expect(errSpy).toHaveBeenCalledTimes(1);
        errSpy.mockRestore();
    });

    it('is a no-op for a null recorder', async () => {
        const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        await expect(recordSafely(null, event)).resolves.toBeUndefined();
        expect(errSpy).not.toHaveBeenCalled();
        errSpy.mockRestore();
    });
});
