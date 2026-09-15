import { describe, it, expect } from 'vitest';
import { sanitizeFilename } from './sanitize.js';

describe('sanitizeFilename', () => {
    it('leaves an ordinary filename alone', () => {
        expect(sanitizeFilename('offer-letter.pdf')).toBe('offer-letter.pdf');
        expect(sanitizeFilename('Acme_Offer.2026.PDF')).toBe('Acme_Offer.2026.PDF');
    });

    it('strips path traversal', () => {
        // The actual vulnerability: temp files were written using this value directly.
        for (const evil of [
            '../../evil.txt',
            '..\\..\\evil.txt',
            '/etc/passwd',
            'C:\\Windows\\System32\\cfg',
            '....//....//evil',
        ]) {
            const safe = sanitizeFilename(evil);
            expect(safe).not.toContain('/');
            expect(safe).not.toContain('\\');
            expect(safe).not.toContain('..');
        }
    });

    it('removes null bytes and control characters', () => {
        expect(sanitizeFilename('offer\u0000.pdf')).toBe('offer.pdf');
        expect(sanitizeFilename('of\u0007fer.pdf')).toBe('offer.pdf');
    });

    it('never returns an empty string', () => {
        for (const input of ['', '...', '///', '\u0000', null, undefined, 42, {}]) {
            expect(sanitizeFilename(input).length).toBeGreaterThan(0);
        }
    });

    it('does not produce a hidden file', () => {
        expect(sanitizeFilename('.bashrc').startsWith('.')).toBe(false);
        expect(sanitizeFilename('...hidden').startsWith('.')).toBe(false);
    });

    it('defuses Windows reserved device names', () => {
        // Writing to "con" or "nul" on Windows targets a device, not a file.
        expect(sanitizeFilename('con')).not.toBe('con');
        expect(sanitizeFilename('NUL.txt')).not.toBe('NUL.txt');
        expect(sanitizeFilename('lpt1.pdf')).not.toBe('lpt1.pdf');
    });

    it('caps length while keeping the extension', () => {
        const long = `${'a'.repeat(400)}.pdf`;
        const safe = sanitizeFilename(long);
        expect(safe.length).toBeLessThanOrEqual(100);
        expect(safe.endsWith('.pdf')).toBe(true);
    });

    it('replaces spaces and unicode with underscores rather than dropping them', () => {
        expect(sanitizeFilename('my offer.pdf')).toBe('my_offer.pdf');
        expect(sanitizeFilename('оффер.pdf')).toBe('_____.pdf');
    });
});
