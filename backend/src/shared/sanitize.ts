/**
 * Filename sanitisation for anything that reaches the filesystem.
 *
 * Recovered from v1's `utils/sanitization.ts` (commit 83a456a), which the rewrite lost.
 *
 * ONLY the filename helper was recovered. The rest of that module was deliberately left
 * behind, and ADR-003's "recover rather than rewrite" note is narrowed accordingly:
 *
 *  - `sanitizeSql` stripped SQL keywords from user input. That corrupts legitimate data
 *    (an offer letter mentioning "select" or a company called "Alter") while providing no
 *    real protection. Drizzle already parameterises every query, which is the actual
 *    defence. Restoring it would have been a downgrade.
 *  - `sanitizeText` / `sanitizeHtml` HTML-escaped on the way *in*. Escaping belongs at
 *    render time, and React escapes by default; storing `&lt;` leads to double-escaped
 *    text and is a well-known anti-pattern. Regex-based HTML sanitisation is also not
 *    reliable — if untrusted HTML ever needs rendering, use a real sanitiser.
 *  - `sanitizeEmail` silently deleted invalid characters. Zod's `.email()` already
 *    rejects bad addresses, and rejecting beats silently altering what someone typed.
 */

/** Windows reserved device names, which cannot be used as filenames even with a suffix. */
const RESERVED = new Set([
    'con', 'prn', 'aux', 'nul',
    'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
    'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

const MAX_LENGTH = 100;

/**
 * Reduce an untrusted filename to a safe basename.
 *
 * `OfferService` writes uploaded files to a temp path built from `file.filename`, which
 * comes straight from the multipart request. Without this, `../../evil.txt` escapes the
 * working directory.
 *
 * Always returns a non-empty string so callers never end up with a bare directory path.
 */
export function sanitizeFilename(input: unknown): string {
    if (typeof input !== 'string' || input.length === 0) return 'upload';

    let name = input
        // Path separators and traversal segments — do this before anything else.
        .replace(/[/\\]/g, '')
        .replace(/\.{2,}/g, '.')
        // Null bytes and control characters.
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x1f\x7f-\x9f]/g, '')
        // Anything else outside a conservative allowlist.
        .replace(/[^a-zA-Z0-9._-]/g, '_')
        // Leading dots would create a hidden file, or resolve oddly.
        .replace(/^\.+/, '');

    if (name.length > MAX_LENGTH) {
        // Preserve the extension when truncating, so type sniffing still works.
        const dot = name.lastIndexOf('.');
        const ext = dot > 0 ? name.slice(dot, dot + 12) : '';
        name = name.slice(0, MAX_LENGTH - ext.length) + ext;
    }

    const stem = (name.split('.')[0] ?? '').toLowerCase();
    if (name.length === 0 || RESERVED.has(stem)) return `upload_${name}`.slice(0, MAX_LENGTH);

    return name;
}
