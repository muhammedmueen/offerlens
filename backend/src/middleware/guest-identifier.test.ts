import { describe, it, expect } from 'vitest';
import { resolveGuestToken, isValidGuestToken } from './guest-identifier.js';

describe('isValidGuestToken', () => {
    it('accepts a lowercase v4-shaped uuid', () => {
        expect(isValidGuestToken('3f2504e0-4f89-41d3-9a0c-0305e82c3301')).toBe(true);
    });

    it('rejects junk, wrong shapes, and non-strings', () => {
        for (const bad of [
            '',
            'not-a-uuid',
            '3F2504E0-4F89-41D3-9A0C-0305E82C3301', // uppercase — not what we issue
            '3f2504e0-4f89-41d3-9a0c-0305e82c3301x',
            'd41d8cd98f00b204e9800998ecf8427e', // an MD5, i.e. the old scheme's value
            null,
            undefined,
            42,
            {},
        ]) {
            expect(isValidGuestToken(bad)).toBe(false);
        }
    });
});

describe('resolveGuestToken', () => {
    it('reuses a valid existing token and does not ask for a new cookie', () => {
        const existing = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';
        expect(resolveGuestToken(existing)).toEqual({ token: existing, isNew: false });
    });

    it('issues a fresh token when no cookie was present', () => {
        const { token, isNew } = resolveGuestToken(null);
        expect(isNew).toBe(true);
        expect(isValidGuestToken(token)).toBe(true);
    });

    it('replaces a malformed token rather than adopting it as an identity', () => {
        // Covers a cookie signed under a rotated secret, or a leftover value from the
        // old MD5(ip + userAgent) scheme.
        const { token, isNew } = resolveGuestToken('d41d8cd98f00b204e9800998ecf8427e');
        expect(isNew).toBe(true);
        expect(isValidGuestToken(token)).toBe(true);
    });

    it('gives different visitors different identities', () => {
        // The whole point of ADR-001: two fresh visitors must not collide, which is
        // exactly what MD5(ip + userAgent) did behind a NAT.
        const a = resolveGuestToken(null).token;
        const b = resolveGuestToken(null).token;
        expect(a).not.toBe(b);
    });
});
