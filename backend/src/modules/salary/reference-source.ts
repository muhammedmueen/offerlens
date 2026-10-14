/**
 * Provenance and attribution for the Stack Overflow Developer Survey 2025 reference rows
 * (table `salary_reference_rows`). Shared by the loader, the salary service and the PDF.
 *
 * The four strings below are legal text. Each is a single-line, single-quoted literal so a test can
 * check that `frontend/src/constants/attribution.ts` carries them verbatim.
 */
export const REFERENCE_SOURCE = {
    source: 'so_survey_2025',
    /** Release date of the SO archive (the survey was collected 2025-05-29 to 2025-06-23). */
    sourceVersion: '2025-07-29',
    licence: 'ODbL-1.0',
    collectedAt: '2025-06-23T00:00:00Z',
} as const;

/** Sources the salary service reads as reference data. */
export const ACTIVE_REFERENCE_SOURCES = [REFERENCE_SOURCE.source] as const;

export const SO_SURVEY_URL = 'https://survey.stackoverflow.co/2025';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
// ponytail: the dataset host is hardcoded. The repo is private, so the old github.com/.../tree
// link 404s for an anonymous visitor (audit D9); this points at the deploy's own static path.
// To move the host, change all four constants (here, city-adjustment.ts, and both in
// frontend/src/constants/attribution.ts) AND the nginx `location /datasets/` block in deploy/.
export const DATASET_URL = 'https://offerlens.mueens.tech/datasets/so-2025-india/';
export const ATTRIBUTION_TEXT = 'Contains information from the Stack Overflow Developer Survey 2025 (Stack Exchange Inc.), made available under the Open Database License (ODbL).';
