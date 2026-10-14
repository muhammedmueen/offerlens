import { describe, it, expect } from 'vitest';
import { envSchema } from './env.schema.js';

/**
 * TRUST_PROXY parsing (audit D10). A hop COUNT, not a boolean: the trap we avoid is
 * `z.coerce.boolean()`, which reads the string `"false"` as true. Unset and `''` mean 0 (off),
 * a valid integer 0-5 passes, and anything else (non-numeric, out of range) is rejected.
 */

// Everything the schema needs beside the field under test, so a parse of TRUST_PROXY alone
// does not fail on a missing required secret.
const base = {
    DATABASE_URL: 'postgres://u:p@localhost:5432/db',
    JWT_SECRET: 'x'.repeat(32),
    JWT_REFRESH_SECRET: 'y'.repeat(32),
};

function parseTrustProxy(value: string | undefined) {
    return envSchema.safeParse(value === undefined ? base : { ...base, TRUST_PROXY: value });
}

describe('env.schema TRUST_PROXY', () => {
    it('defaults to 0 when unset', () => {
        const result = parseTrustProxy(undefined);
        expect(result.success).toBe(true);
        expect(result.success && result.data.TRUST_PROXY).toBe(0);
    });

    it('treats an empty string as 0', () => {
        const result = parseTrustProxy('');
        expect(result.success).toBe(true);
        expect(result.success && result.data.TRUST_PROXY).toBe(0);
    });

    it.each([
        ['0', 0],
        ['1', 1],
        ['2', 2],
        ['5', 5],
    ])('accepts %s as the number %i', (input, expected) => {
        const result = parseTrustProxy(input);
        expect(result.success).toBe(true);
        expect(result.success && result.data.TRUST_PROXY).toBe(expected);
    });

    it.each(['abc', '10', '-1', '1.5', 'true', 'false'])('rejects %s', (input) => {
        expect(parseTrustProxy(input).success).toBe(false);
    });
});
