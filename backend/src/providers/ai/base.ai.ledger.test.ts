import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAiProvider, type AiTask, type CompletionRequest, type CompletionResult } from './base.ai.js';
import { MockAiProvider } from './mock.ai.js';
import { estimateCostUsd, type AiProviderName, type UsageEvent, type UsageRecorder } from './usage.js';
import { analysisResultSchema } from '@/modules/analysis/analysis.zod.js';

/**
 * Metering is tested through a concrete subclass with a SCRIPTED `complete`, because the
 * behaviour under test — one ledger row per attempt, per-model pricing, failed attempts still
 * recorded, thinking tokens folded in — lives entirely in the base class's `call` wrapper and
 * the retry loop around it.
 */
type Scripted = CompletionResult | Error;

class TestProvider extends BaseAiProvider {
    readonly name: AiProviderName = 'gemini';
    protected readonly fallbackModels = ['gemini-2.5-flash', 'gemini-flash-lite-latest'] as const;
    private queue: Scripted[];
    /** Models passed to each complete() call, in order — so tests can assert per-model pricing. */
    readonly modelsCalled: string[] = [];

    constructor(queue: Scripted[]) {
        super();
        this.queue = queue;
    }

    protected modelFor(task: AiTask): string {
        return task === 'metadata' ? 'gemini-flash-lite-latest' : 'gemini-2.5-flash';
    }

    protected isRetryable(error: unknown): boolean {
        return (error as { status?: number })?.status === 503;
    }

    protected async complete(request: CompletionRequest): Promise<CompletionResult> {
        this.modelsCalled.push(request.model);
        const next = this.queue.shift();
        if (next === undefined) throw new Error('scripted queue exhausted');
        if (next instanceof Error) throw next;
        return next;
    }
}

function err(status: number): Error {
    return Object.assign(new Error(`[${status}]`), { status });
}

/** A valid analysis JSON string, reused for the success-path analysis cases. */
async function validAnalysisJson(): Promise<string> {
    const analysis = await new MockAiProvider().analyzeOffer('x');
    return JSON.stringify(analysis);
}

let logs: ReturnType<typeof vi.spyOn>[];

beforeEach(() => {
    logs = [
        vi.spyOn(console, 'log').mockImplementation(() => {}),
        vi.spyOn(console, 'warn').mockImplementation(() => {}),
        vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
});

afterEach(() => {
    logs.forEach((s) => s.mockRestore());
});

describe('one row per call across a fallback chain', () => {
    it('records a failed-then-successful metadata chain, priced per model', async () => {
        const events: UsageEvent[] = [];
        const recorder: UsageRecorder = vi.fn(async (e) => { events.push(e); });
        const provider = new TestProvider([
            err(503),
            { text: '{"role":"x"}', inputTokens: 100, outputTokens: 20 },
        ]);
        provider.recorder = recorder;

        await provider.extractMetadata('text');

        expect(events).toHaveLength(2);
        expect(events[0]).toMatchObject({
            purpose: 'metadata', model: 'gemini-flash-lite-latest', success: false,
            errorCode: 'provider_503', inputTokens: 0, outputTokens: 0,
        });
        expect(events[1]).toMatchObject({
            purpose: 'metadata', model: 'gemini-2.5-flash', success: true,
            inputTokens: 100, outputTokens: 20,
        });
        expect(events[1].costUsd).toBeCloseTo(estimateCostUsd('gemini-2.5-flash', 100, 20)!, 9);
    });
});

describe('analyzeOffer metering', () => {
    it('prices a fallback chain per model and matches metadata.usage cost', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([
            err(503),
            { text: await validAnalysisJson(), inputTokens: 500, outputTokens: 300 },
        ]);
        provider.recorder = async (e) => { events.push(e); };

        const result = await provider.analyzeOffer('offer text');

        // Round-trips through the real schema, proving the mock JSON is a valid analysis.
        expect(analysisResultSchema.safeParse(JSON.parse(await validAnalysisJson())).success).toBe(true);

        const successRow = events.find((e) => e.success)!;
        expect(successRow.model).toBe('gemini-flash-lite-latest');
        expect(result.metadata.usage!.costUsd).toBeCloseTo(successRow.costUsd!, 9);
    });

    it('records a row for every failed attempt (invalid JSON then schema mismatch)', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([
            { text: 'not json', inputTokens: 10, outputTokens: 1 },
            { text: '[]', inputTokens: 12, outputTokens: 1 },
        ]);
        provider.recorder = async (e) => { events.push(e); };

        await expect(provider.analyzeOffer('x')).rejects.toThrow();

        expect(events).toHaveLength(2);
        expect(events.map((e) => e.errorCode)).toEqual(['invalid_json', 'schema_mismatch']);
        expect(events.every((e) => !e.success)).toBe(true);
        expect(events[0].inputTokens).toBe(10);
    });

    it('records one failed row per model when all are exhausted', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([err(503), err(503)]);
        provider.recorder = async (e) => { events.push(e); };

        await expect(provider.analyzeOffer('x')).rejects.toThrow();
        // Two models in the chain (requested == first fallback), one row each.
        expect(events).toHaveLength(2);
        expect(events.every((e) => e.success === false && e.errorCode === 'provider_503')).toBe(true);
    });
});

describe('career and negotiation metering', () => {
    it('records a single career row', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([{ text: '{"timeline":[]}', inputTokens: 30, outputTokens: 10 }]);
        provider.recorder = async (e) => { events.push(e); };
        await provider.generateCareerPath({ role: 'SWE', companyType: 'product', industry: 'Tech' });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ purpose: 'career', success: true });
    });

    it('records a single negotiation row', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([{ text: '{"subject":"s","body":"b"}', inputTokens: 40, outputTokens: 15 }]);
        provider.recorder = async (e) => { events.push(e); };
        await provider.generateNegotiationScript({
            companyName: 'Acme', role: 'SWE', currentOffer: {}, marketData: {}, suggestions: [], tone: 'professional',
        });
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ purpose: 'negotiation', success: true });
    });

    it('records invalid JSON as a failed career row and still returns the fallback object', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([{ text: 'not json', inputTokens: 5, outputTokens: 1 }]);
        provider.recorder = async (e) => { events.push(e); };
        const result = await provider.generateCareerPath({ role: 'SWE', companyType: 'x', industry: 'y' }) as { error?: string };
        expect(events).toHaveLength(1);
        expect(events[0]).toMatchObject({ purpose: 'career', success: false, errorCode: 'invalid_json' });
        expect(result.error).toBeTruthy();
    });
});

describe('thinking tokens', () => {
    it('records thinkingTokens and folds them into the output rate for cost', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([{ text: '{"role":"x"}', inputTokens: 100, outputTokens: 20, thinkingTokens: 300 }]);
        provider.recorder = async (e) => { events.push(e); };
        await provider.extractMetadata('text');
        expect(events[0].thinkingTokens).toBe(300);
        expect(events[0].costUsd).toBeCloseTo(estimateCostUsd('gemini-flash-lite-latest', 100, 20 + 300)!, 9);
    });

    it('defaults thinkingTokens to 0 when the field is absent', async () => {
        const events: UsageEvent[] = [];
        const provider = new TestProvider([{ text: '{"role":"x"}', inputTokens: 100, outputTokens: 20 }]);
        provider.recorder = async (e) => { events.push(e); };
        await provider.extractMetadata('text');
        expect(events[0].thinkingTokens).toBe(0);
    });
});

describe('a broken recorder never breaks the call', () => {
    it('tolerates a recorder that rejects', async () => {
        const provider = new TestProvider([{ text: '{"role":"x"}', inputTokens: 1, outputTokens: 1 }]);
        provider.recorder = async () => { throw new Error('db down'); };
        await expect(provider.extractMetadata('text')).resolves.toEqual({ role: 'x' });
        expect(console.error).toHaveBeenCalled();
    });

    it('tolerates a recorder that throws synchronously', async () => {
        const provider = new TestProvider([{ text: '{"role":"x"}', inputTokens: 1, outputTokens: 1 }]);
        provider.recorder = (() => { throw new Error('boom'); }) as never;
        await expect(provider.extractMetadata('text')).resolves.toEqual({ role: 'x' });
    });

    it('works with a null recorder', async () => {
        const provider = new TestProvider([{ text: '{"role":"x"}', inputTokens: 1, outputTokens: 1 }]);
        provider.recorder = null;
        await expect(provider.extractMetadata('text')).resolves.toEqual({ role: 'x' });
    });
});
