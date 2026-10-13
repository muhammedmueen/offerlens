/**
 * Attribution for the Stack Overflow Developer Survey 2025 benchmark (ODbL).
 *
 * Mirrors backend/src/modules/salary/reference-source.ts. The two packages share no code, so
 * backend/src/modules/salary/reference-source.test.ts reads this file as text and fails if any
 * value drifts. Keep each constant a single-line, single-quoted literal with no escapes.
 */
export const SO_SURVEY_URL = 'https://survey.stackoverflow.co/2025';
export const ODBL_URL = 'https://opendatacommons.org/licenses/odbl/1-0/';
export const DATASET_URL = 'https://github.com/muhammedmueen/offerlens/tree/main/data/so-2025-india';
export const ATTRIBUTION_TEXT = 'Contains information from the Stack Overflow Developer Survey 2025 (Stack Exchange Inc.), made available under the Open Database License (ODbL).';

/**
 * Attribution for the PLFS 2023-24 city factor (MoSPI Data Access Agreement, task 5.1b).
 * Mirrors backend/src/modules/salary/city-adjustment.ts; same drift test, same literal-format rule.
 */
export const PLFS_URL = 'https://microdata.gov.in/NADA/index.php/catalog/213';
export const PLFS_DATASET_URL = 'https://github.com/muhammedmueen/offerlens/tree/main/data/plfs-city-factors';
export const PLFS_CITATION_TEXT = 'City adjustment derived from the Periodic Labour Force Survey 2023-24, National Statistics Office, MoSPI.';
