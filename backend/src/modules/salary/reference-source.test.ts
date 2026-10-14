import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { ATTRIBUTION_TEXT, DATASET_URL, ODBL_URL, SO_SURVEY_URL } from './reference-source.js';
import { PLFS_CITATION_TEXT, PLFS_DATASET_URL, PLFS_URL } from './city-adjustment.js';

// The ODbL attribution is legal text kept in two packages that share no code. This fails if the
// frontend copy drifts (or the file goes missing; readFileSync throws).
describe('reference-source attribution', () => {
    const frontend = readFileSync(
        new URL('../../../../frontend/src/constants/attribution.ts', import.meta.url),
        'utf8',
    );

    it('has non-empty constants and the ODbL 1.0 link', () => {
        for (const v of [ATTRIBUTION_TEXT, DATASET_URL, ODBL_URL, SO_SURVEY_URL]) expect(v.length).toBeGreaterThan(0);
        expect(ODBL_URL).toContain('odbl/1-0');
    });

    // Audit D9: the dataset links now point at the deploy's own static host, not the private
    // github.com/.../tree URL that 404s for an anonymous visitor. The host is hardcoded (see the
    // ponytail: comments on the constants); this pins it so a stray edit does not reintroduce the
    // dead GitHub link.
    it('serves the dataset links from the deploy host, not a private GitHub tree URL', () => {
        for (const url of [DATASET_URL, PLFS_DATASET_URL]) {
            expect(url).toContain('offerlens.mueens.tech/datasets/');
            expect(url).not.toContain('github.com');
        }
    });

    it.each([
        ['SO_SURVEY_URL', SO_SURVEY_URL],
        ['ODBL_URL', ODBL_URL],
        ['DATASET_URL', DATASET_URL],
        ['ATTRIBUTION_TEXT', ATTRIBUTION_TEXT],
        ['PLFS_URL', PLFS_URL],
        ['PLFS_DATASET_URL', PLFS_DATASET_URL],
        ['PLFS_CITATION_TEXT', PLFS_CITATION_TEXT],
    ])('frontend attribution.ts carries %s verbatim', (name, value) => {
        expect(frontend).toContain(`export const ${name} = '${value}';`);
    });
});
