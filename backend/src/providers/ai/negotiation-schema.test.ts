import { describe, it, expect } from 'vitest';
import { negotiationScriptSchema, parseJsonLoose } from './base.ai.js';

// ponytail: this tests the exported Zod schema + the parseJsonLoose fence directly rather than
// driving the base provider's `complete` seam, because MockAiProvider does not extend
// BaseAiProvider and has no such seam. Ceiling: it proves the validation decision, not the
// withFallback/call wiring around it — that wiring is exercised by the service test. The two
// concerns stay in separate files so each stays small and its mocks honest.

describe('negotiationScriptSchema', () => {
    it('accepts a non-empty subject and body', () => {
        const r = negotiationScriptSchema.safeParse({ subject: 'Re: offer', body: 'Dear team' });
        expect(r.success).toBe(true);
    });

    it('rejects an empty subject', () => {
        expect(negotiationScriptSchema.safeParse({ subject: '', body: 'x' }).success).toBe(false);
    });

    it('rejects a whitespace-only subject (proves .trim())', () => {
        expect(negotiationScriptSchema.safeParse({ subject: '   ', body: 'x' }).success).toBe(false);
    });

    it('rejects a whitespace-only body (proves .trim())', () => {
        expect(negotiationScriptSchema.safeParse({ subject: 'x', body: '\n\t ' }).success).toBe(false);
    });

    it('rejects a payload missing subject/body — NEG-6 exact case', () => {
        expect(negotiationScriptSchema.safeParse({ email: 'whole thing' }).success).toBe(false);
    });
});

describe('parseJsonLoose fence handling (NEG-6 parse fence)', () => {
    it('parses markdown-fenced JSON', () => {
        expect(parseJsonLoose('```json\n{"subject":"s","body":"b"}\n```'))
            .toEqual({ subject: 's', body: 'b' });
    });

    it('throws on non-JSON text', () => {
        expect(() => parseJsonLoose('not json')).toThrow();
    });
});
