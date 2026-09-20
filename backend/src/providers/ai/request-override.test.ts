import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The production refusal is the load-bearing part of this feature, so it is tested rather
 * than asserted in a comment. `config` is mocked because these gates read it at call time.
 */
const mockConfig = {
    NODE_ENV: 'development' as string,
    ALLOW_AI_REQUEST_OVERRIDE: true as boolean,
};

vi.mock('@/config/index.js', () => ({
    get config() { return mockConfig; },
}));

const load = async () => import('./request-override.js');

beforeEach(() => {
    mockConfig.NODE_ENV = 'development';
    mockConfig.ALLOW_AI_REQUEST_OVERRIDE = true;
    vi.resetModules();
});

afterEach(() => {
    vi.resetModules();
});

const HEADERS = {
    'x-ai-provider': 'openai',
    'x-ai-model': 'gpt-4.1',
    'x-ai-key': 'sk-secret-value',
};

describe('the two gates', () => {
    it('honours headers in development with the flag on', async () => {
        const { resolveAiOverride } = await load();
        expect(resolveAiOverride(HEADERS)).toEqual({
            provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-secret-value',
        });
    });

    it('IGNORES headers in production even with the flag on', async () => {
        // The whole point. An endpoint accepting arbitrary keys and model names in production
        // lets a caller bill expensive models to the server's key, or proxy requests on
        // someone else's credentials from our IP.
        mockConfig.NODE_ENV = 'production';
        mockConfig.ALLOW_AI_REQUEST_OVERRIDE = true;

        const { resolveAiOverride, aiOverrideAllowed } = await load();
        expect(aiOverrideAllowed()).toBe(false);
        expect(resolveAiOverride(HEADERS)).toEqual({});
    });

    it('ignores headers in development when the flag is off', async () => {
        // Off by default, so a non-production deployment does not get this merely by not
        // being production.
        mockConfig.ALLOW_AI_REQUEST_OVERRIDE = false;

        const { resolveAiOverride } = await load();
        expect(resolveAiOverride(HEADERS)).toEqual({});
    });

    it('ignores rather than rejects, so a prober learns nothing', async () => {
        mockConfig.NODE_ENV = 'production';
        const { resolveAiOverride } = await load();
        // No throw, no signal that the feature exists at all.
        expect(() => resolveAiOverride(HEADERS)).not.toThrow();
    });
});

describe('validation', () => {
    it('drops an unknown provider instead of passing it through', async () => {
        const { resolveAiOverride } = await load();
        const selection = resolveAiOverride({ 'x-ai-provider': 'definitely-not-a-provider' });
        expect(selection.provider).toBeUndefined();
    });

    it('accepts every provider the factory can build', async () => {
        const { resolveAiOverride } = await load();
        for (const provider of ['gemini', 'openai', 'anthropic', 'mock']) {
            expect(resolveAiOverride({ 'x-ai-provider': provider }).provider).toBe(provider);
        }
    });

    it('normalises case and trims whitespace', async () => {
        const { resolveAiOverride } = await load();
        expect(resolveAiOverride({ 'x-ai-provider': '  OpenAI  ' }).provider).toBe('openai');
    });

    it('takes the first value when a header is repeated', async () => {
        const { resolveAiOverride } = await load();
        expect(resolveAiOverride({ 'x-ai-provider': ['openai', 'anthropic'] }).provider).toBe('openai');
    });

    it('returns an empty selection for no headers, so callers need no branch', async () => {
        const { resolveAiOverride } = await load();
        expect(resolveAiOverride({})).toEqual({});
    });

    it('ignores empty header values', async () => {
        const { resolveAiOverride } = await load();
        expect(resolveAiOverride({ 'x-ai-model': '   ', 'x-ai-key': '' })).toEqual({});
    });
});

describe('redactSelection', () => {
    it('replaces the key, because selections reach BullMQ job data and logs', async () => {
        // BullMQ keeps completed job payloads for a while, so a key left in one outlives the
        // request that supplied it.
        const { redactSelection } = await load();
        const redacted = redactSelection({ provider: 'openai', model: 'gpt-4.1', apiKey: 'sk-secret-value' });

        expect(redacted.apiKey).toBe('[redacted]');
        expect(JSON.stringify(redacted)).not.toContain('sk-secret-value');
        expect(redacted.provider).toBe('openai');
        expect(redacted.model).toBe('gpt-4.1');
    });

    it('does not invent a key field when there was none', async () => {
        const { redactSelection } = await load();
        expect(redactSelection({ provider: 'gemini' })).toEqual({ provider: 'gemini' });
    });
});
