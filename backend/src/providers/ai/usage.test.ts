import { describe, it, expect } from 'vitest';
import { estimateCostUsd, emptyUsage, addCall, formatUsage, PRICING } from './usage.js';

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

    it('reports the model that actually answered after a fallback', () => {
        let usage = emptyUsage('gemini', 'gemini-2.5-flash');
        usage = addCall(usage, { model: 'gemini-2.5-flash', inputTokens: 100, outputTokens: 0 });
        usage = addCall(usage, { model: 'gemini-flash-lite-latest', inputTokens: 100, outputTokens: 50 });

        expect(usage.model).toBe('gemini-flash-lite-latest');
        // ...and is priced as the lite model, not the one originally requested.
        expect(usage.costUsd).toBeCloseTo((200 / 1e6) * 0.10 + (50 / 1e6) * 0.40, 9);
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
