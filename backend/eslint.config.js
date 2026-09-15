import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Backend lint config. Restored in -1C — `npm run lint` was only `tsc --noEmit`, so
 * nothing caught the classes of bug TypeScript is happy with.
 *
 * Deliberately conservative. The goal is to catch real mistakes on a codebase that has
 * never been linted, not to reformat it or start an argument about style. A wall of
 * warnings on day one gets `--no-verify`d and then ignored.
 *
 * Notably NOT enabled yet:
 *   - `no-explicit-any` — the codebase leans on `any` for AI-derived JSON. Phase 1 adds
 *     Zod validation, which is what makes those types knowable; tightening before then
 *     would just mean hundreds of suppressions.
 *   - type-aware rules (`recommendedTypeChecked`) — slower, and they surface a lot at
 *     once. Worth enabling once the current set is clean.
 */
export default tseslint.config(
    {
        ignores: ['dist/**', 'drizzle/**', 'node_modules/**', '*.mjs', 'eslint.config.js'],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        languageOptions: {
            ecmaVersion: 2022,
            sourceType: 'module',
            globals: {
                process: 'readonly',
                console: 'readonly',
                Buffer: 'readonly',
                URL: 'readonly',
                fetch: 'readonly',
                FormData: 'readonly',
                Blob: 'readonly',
                setTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
            },
        },
        rules: {
            // Unused code is usually a leftover from a half-finished change. Argument
            // names are exempt when prefixed with _, which is the existing convention.
            '@typescript-eslint/no-unused-vars': [
                'error',
                { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
            ],

            // Escape hatches must be justified, so they can be found and removed later.
            '@typescript-eslint/ban-ts-comment': ['error', { 'ts-expect-error': 'allow-with-description' }],

            // Real bug classes.
            'no-constant-condition': 'error',
            'no-dupe-keys': 'error',
            'no-unreachable': 'error',
            'require-atomic-updates': 'off', // Too many false positives around await.
            'no-await-in-loop': 'off',       // Polling loops are intentional.

            // A floating promise in a worker means an error vanishes silently.
            'no-async-promise-executor': 'error',

            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },
);
