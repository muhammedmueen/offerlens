import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BaseAiProvider, type AiTask, type CompletionRequest, type CompletionResult } from './base.ai.js';
import type { AiProviderName } from './usage.js';

/**
 * Model resolution, tested through the real base class.
 *
 * The bug: the enqueue path defaulted every job's `model` to DEFAULT_GEMINI_MODEL, so
 * selecting OpenAI or Anthropic handed that adapter "gemini-2.5-flash". A vendor's
 * invalid-model error is a 404 and none of the adapters classify that as retryable — rightly,
 * since retrying a malformed request elsewhere only burns quota — so `withFallback` rethrew on
 * the first attempt, the remaining models were never tried, and the analysis died with
 * nothing in the log naming the cause.
 *
 * A concrete subclass rather than a mock, because the interesting behaviour is the interaction
 * between `requested`, `modelOverride` and `modelFor` — all three of which live here.
 */
class TestProvider extends BaseAiProvider {
    readonly name: AiProviderName = 'openai';
    protected readonly fallbackModels = ['gpt-4.1-mini', 'gpt-4.1-nano'] as const;

    constructor(override?: string) {
        super();
        this.modelOverride = override;
    }

    protected modelFor(task: AiTask): string {
        return task === 'metadata' ? 'gpt-4.1-nano' : 'gpt-4.1-mini';
    }

    protected async complete(_request: CompletionRequest): Promise<CompletionResult> {
        throw new Error('not used by these tests');
    }

    protected isRetryable(): boolean {
        return false;
    }

    /** `resolveModel` is protected; this is the seam for testing it. */
    pick(task: AiTask, requested?: string): string {
        return this.resolveModel(task, requested);
    }
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => { });
});

afterEach(() => {
    warn.mockRestore();
});

describe('resolveModel precedence', () => {
    it('prefers an explicitly requested model of its own vendor', () => {
        expect(new TestProvider().pick('analysis', 'gpt-4.1')).toBe('gpt-4.1');
    });

    it('falls back to the pinned override', () => {
        expect(new TestProvider('gpt-4o-mini').pick('analysis')).toBe('gpt-4o-mini');
    });

    it('falls back to the per-task default', () => {
        expect(new TestProvider().pick('analysis')).toBe('gpt-4.1-mini');
        expect(new TestProvider().pick('metadata')).toBe('gpt-4.1-nano');
    });

    it('lets a requested model beat the override, which is the point of the override order', () => {
        expect(new TestProvider('gpt-4o-mini').pick('analysis', 'gpt-4.1')).toBe('gpt-4.1');
    });
});

describe('foreign model ids', () => {
    it('ignores a requested id belonging to another vendor', () => {
        // The exact shape of the bug: a Gemini id in an OpenAI job payload.
        expect(new TestProvider().pick('analysis', 'gemini-2.5-flash')).toBe('gpt-4.1-mini');
        expect(warn).toHaveBeenCalledOnce();
        expect(String(warn.mock.calls[0][0])).toContain('gemini-2.5-flash');
    });

    it('ignores a foreign id in the pinned override too', () => {
        // modelOverride is set from AiProviderSelection.model, which arrives from the upload
        // form field and the X-AI-Model development header. Neither knows which provider runs,
        // so checking only `requested` would have left this path open.
        expect(new TestProvider('claude-sonnet-4-5').pick('analysis')).toBe('gpt-4.1-mini');
        expect(warn).toHaveBeenCalledOnce();
    });

    it('still honours the override when the request is foreign', () => {
        expect(new TestProvider('gpt-4o-mini').pick('analysis', 'gemini-2.5-flash')).toBe('gpt-4o-mini');
    });

    it('passes through an unrecognised prefix rather than vetoing it', () => {
        // Fails open on purpose: a vendor shipping an id in a new format must still work.
        expect(new TestProvider().pick('analysis', 'gpt5-experimental-x')).toBe('gpt5-experimental-x');
        expect(new TestProvider().pick('analysis', 'some-internal-deployment')).toBe('some-internal-deployment');
        expect(warn).not.toHaveBeenCalled();
    });

    it('does not warn when nothing was requested', () => {
        new TestProvider().pick('analysis');
        expect(warn).not.toHaveBeenCalled();
    });
});
