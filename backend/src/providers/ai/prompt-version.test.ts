import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { PROMPT_VERSION, PROMPT_REVISION, PROMPT_FINGERPRINT } from './prompt-version.js';
import { SYSTEM_INSTRUCTION, buildAnalysisPrompt } from './analysis.prompt.js';
import { GEMINI_RESPONSE_SCHEMA } from '@/modules/analysis/analysis.zod.js';

/**
 * The claim being tested is that the fingerprint cannot go stale. A version string that does
 * not move when the prompt moves is worse than no version string: it makes two different
 * contracts look identical in the eval history, which is exactly how `analysisVersion` came to
 * report "1.0" for every analysis ever stored.
 */

const SENTINEL = 'PROMPT FINGERPRINT SENTINEL';

/** Mirrors computeFingerprint, so a change to the material can be measured against it. */
function hash(system: string, rendered: string, schema: unknown): string {
    return createHash('sha256')
        .update([system, rendered, JSON.stringify(schema)].join('\u0000'))
        .digest('hex')
        .slice(0, 8);
}

describe('PROMPT_VERSION', () => {
    it('is revision plus fingerprint', () => {
        expect(PROMPT_VERSION).toBe(`${PROMPT_REVISION}+${PROMPT_FINGERPRINT}`);
        expect(PROMPT_VERSION).toMatch(/^\d+\.\d+\+[0-9a-f]{8}$/);
    });

    it('is stable across calls', () => {
        // Nothing request-specific may leak into the material, or every analysis would be
        // stamped with a different version.
        expect(hash(SYSTEM_INSTRUCTION, buildAnalysisPrompt(SENTINEL), GEMINI_RESPONSE_SCHEMA))
            .toBe(PROMPT_FINGERPRINT);
    });

    it('does not depend on the offer text', () => {
        const a = hash(SYSTEM_INSTRUCTION, buildAnalysisPrompt('one letter'), GEMINI_RESPONSE_SCHEMA);
        const b = hash(SYSTEM_INSTRUCTION, buildAnalysisPrompt('a completely different letter'), GEMINI_RESPONSE_SCHEMA);
        // It does vary with the text, which is why a fixed sentinel is used rather than a
        // real document. This asserts the sentinel is doing that job.
        expect(a).not.toBe(b);
        expect(PROMPT_FINGERPRINT).not.toBe(a);
    });

    it('changes when the system instruction changes', () => {
        expect(hash(SYSTEM_INSTRUCTION + '\n8. One more rule.', buildAnalysisPrompt(SENTINEL), GEMINI_RESPONSE_SCHEMA))
            .not.toBe(PROMPT_FINGERPRINT);
    });

    it('changes when the response schema changes', () => {
        const altered = JSON.parse(JSON.stringify(GEMINI_RESPONSE_SCHEMA));
        altered.required = [...(altered.required ?? []), 'somethingNew'];
        expect(hash(SYSTEM_INSTRUCTION, buildAnalysisPrompt(SENTINEL), altered))
            .not.toBe(PROMPT_FINGERPRINT);
    });

    it('is not the value the model used to report', () => {
        // Regression guard. If this ever equals '1.0' again, the server-side stamp has been
        // removed and the field is being taken from the model once more.
        expect(PROMPT_VERSION).not.toBe('1.0');
    });
});

describe('response schema', () => {
    it('no longer asks the model for analysisVersion or modelUsed', () => {
        // Both are facts about our request. Asking spent output tokens on values the server
        // overwrites, and the model answered "1.0" through an entire prompt rewrite.
        const metadata = (GEMINI_RESPONSE_SCHEMA as { properties?: Record<string, { properties?: Record<string, unknown> }> })
            .properties?.metadata?.properties ?? {};

        expect(Object.keys(metadata)).not.toContain('analysisVersion');
        expect(Object.keys(metadata)).not.toContain('modelUsed');
        expect(Object.keys(metadata)).toContain('processingNote');
    });
});
