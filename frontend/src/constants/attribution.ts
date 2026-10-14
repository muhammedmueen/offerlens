/**
 * Attribution for the Stack Overflow Developer Survey 2025 benchmark (ODbL).
 *
 * Mirrors backend/src/modules/salary/reference-source.ts. The two packages share no code, so
 * backend/src/modules/salary/reference-source.test.ts reads this file as text and fails if any
 * value drifts. Keep each constant a single-line, single-quoted literal with no escapes.
 */
export const SO_SURVEY_URL = 'https://survey.stackoverflow.co/2025';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
// ponytail: the dataset host is hardcoded here and in backend/src/modules/salary/*. To move it,
// change all four constants (this DATASET_URL, PLFS_DATASET_URL below, and the two in
// reference-source.ts / city-adjustment.ts) AND the nginx `location /datasets/` block in deploy/.
export const DATASET_URL = 'https://offerlens.mueens.tech/datasets/so-2025-india/';
export const ATTRIBUTION_TEXT = 'Contains information from the Stack Overflow Developer Survey 2025 (Stack Exchange Inc.), made available under the Open Database License (ODbL).';

/**
 * Attribution for the PLFS 2023-24 city factor (MoSPI Data Access Agreement, task 5.1b).
 * Mirrors backend/src/modules/salary/city-adjustment.ts; same drift test, same literal-format rule.
 */
export const PLFS_URL = 'https://microdata.gov.in/NADA/index.php/catalog/213';
// ponytail: hardcoded host (see DATASET_URL above for the full change-list). Only served after
// the owner passes the PLFS gate (the MoSPI e-mail).
export const PLFS_DATASET_URL = 'https://offerlens.mueens.tech/datasets/plfs-city-factors/';
export const PLFS_CITATION_TEXT = 'City adjustment derived from the Periodic Labour Force Survey 2023-24, National Statistics Office, MoSPI.';
