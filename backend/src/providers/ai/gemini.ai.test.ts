import { describe, it, expect } from 'vitest';
import { isRetryableModelError } from './gemini.ai.js';
import { GEMINI_FALLBACK_MODELS, DEFAULT_GEMINI_MODEL } from '@/config/constants.js';

describe('isRetryableModelError', () => {
    it('retries a 503 overloaded model', () => {
        // The actual bug. Verified live: the default model returned this exact shape
        // while two healthy fallbacks went untried, failing every analysis.
        const real = new Error(
            '[GoogleGenerativeAI Error]: Error fetching from ' +
            'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest' +
            ':generateContent: [503 Service Unavailable] This model is currently ' +
            'experiencing high demand. Please try again later.',
        );
        expect(isRetryableModelError(real)).toBe(true);
    });

    it('retries rate limits', () => {
        expect(isRetryableModelError({ status: 429 })).toBe(true);
        expect(isRetryableModelError(new Error('[429 Too Many Requests] quota exceeded'))).toBe(true);
        expect(isRetryableModelError(new Error('RESOURCE_EXHAUSTED'))).toBe(true);
    });

    it('retries transient 500s', () => {
        expect(isRetryableModelError({ status: 500 })).toBe(true);
        expect(isRetryableModelError(new Error('[500 Internal Server Error]'))).toBe(true);
    });

    it('retries on numeric status even when the message says nothing useful', () => {
        expect(isRetryableModelError({ status: 503, message: '' })).toBe(true);
    });

    it('does NOT retry a 400 — that is our malformed request, not the model', () => {
        const err = new Error('[400 Bad Request] Invalid JSON payload received.');
        expect(isRetryableModelError(err)).toBe(false);
    });

    it('does NOT retry a JSON parse failure', () => {
        // Retrying the same unparseable output on another model just burns quota.
        let parseError: unknown;
        try {
            JSON.parse('not json');
        } catch (e) {
            parseError = e;
        }
        expect(isRetryableModelError(parseError)).toBe(false);
    });

    it('handles null, undefined and odd shapes without throwing', () => {
        expect(isRetryableModelError(null)).toBe(false);
        expect(isRetryableModelError(undefined)).toBe(false);
        expect(isRetryableModelError({})).toBe(false);
        expect(isRetryableModelError('a string')).toBe(false);
    });
});

describe('model configuration', () => {
    it('lists only models verified to answer generateContent', () => {
        // Checked live against ListModels plus real calls. gemini-2.0-flash and
        // gemini-2.0-flash-lite do not exist; gemini-2.5-flash-lite is listed but 404s.
        expect([...GEMINI_FALLBACK_MODELS]).toEqual([
            'gemini-2.5-flash',
            'gemini-flash-latest',
            'gemini-flash-lite-latest',
        ]);
    });

    it('has no duplicate entries, which would waste a fallback attempt', () => {
        expect(new Set(GEMINI_FALLBACK_MODELS).size).toBe(GEMINI_FALLBACK_MODELS.length);
    });

    it('defaults to a model that is also in the fallback chain', () => {
        expect([...GEMINI_FALLBACK_MODELS]).toContain(DEFAULT_GEMINI_MODEL);
    });
});
