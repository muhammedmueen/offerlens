import { CITIES } from '@/db/seed-data.js';

/**
 * Task 5.1b: PLFS 2023-24 city factors for the survey benchmark. Pure, no I/O, so confidence, the
 * rubric, the prompt text and the PDF can import it without pulling in `db`.
 *
 * The factor is a ratio only: PLFS rupees (monthly cash earnings, not CTC) never reach a user.
 * Non-commercial use under the MoSPI Data Access Agreement; see data/plfs-city-factors/README.md.
 */
export const PLFS_SOURCE = {
    source: 'plfs_2023_24',
    sourceVersion: '2023-24',
    licence: 'PLFS-DAA-non-commercial',
    referencePeriodEnd: '2024-06-30T00:00:00Z',
    period: '2023-24',
} as const;

/** Sources the salary service reads as city factors. */
export const ACTIVE_CITY_FACTOR_SOURCES = [PLFS_SOURCE.source] as const;

/** Unweighted sampled persons a city needs before a factor exists. Same floor as the builder, loader and DB CHECK. */
export const MIN_PLFS_RESPONDENTS = 30;
/** Same bounds as the builder (G5), the CSV parser and the DB CHECK. */
export const FACTOR_MIN = 0.5;
export const FACTOR_MAX = 2.0;

export const CITY_ADJUSTED_SCOPES = ['role_experience_city_adjusted', 'role_city_adjusted'] as const;
export type CityAdjustedScope = (typeof CITY_ADJUSTED_SCOPES)[number];

export function isCityAdjustedScope(scope: string | null | undefined): scope is CityAdjustedScope {
    return (CITY_ADJUSTED_SCOPES as readonly string[]).includes(scope ?? '');
}

/** Scopes whose figures cover all experience levels (no bracket): used for the "across all experience levels" wording. */
export function isAllExperienceScope(scope: string | null | undefined): boolean {
    return scope === 'role_national' || scope === 'role_city_adjusted';
}

/** Additive object on a benchmark, a stored `salaryComparison` and the Explorer response. */
export interface CityAdjustment {
    source: typeof PLFS_SOURCE.source;
    /** Canonical metro key, e.g. 'delhi ncr'. */
    city: string;
    /** Display name, e.g. 'Delhi NCR'. */
    cityLabel: string;
    /** Rounded to 2 dp: the number shown is the number that was multiplied. */
    factor: number;
    /** Unweighted PLFS persons behind the factor (>= 30). */
    plfsSampleSize: number;
    period: typeof PLFS_SOURCE.period;
}

/** A stored row is only applied if it clears every bound again; anything else means "no factor". */
export function isUsableFactor(row: { nRespondents: number; factor: number } | null | undefined): boolean {
    return !!row
        && Number.isInteger(row.nRespondents) && row.nRespondents >= MIN_PLFS_RESPONDENTS
        && Number.isFinite(row.factor) && row.factor >= FACTOR_MIN && row.factor <= FACTOR_MAX;
}

/** Display name for a canonical metro key, in the casing the UI already shows. Falls back to the key. */
export function cityLabel(key: string): string {
    return CITIES.find((c) => c.name.toLowerCase() === key)?.name ?? key;
}

export function adjustedLocationLabel(key: string): string {
    return `India (national), adjusted for ${cityLabel(key)}`;
}

export const PLFS_CITATION_TEXT = 'City adjustment derived from the Periodic Labour Force Survey 2023-24, National Statistics Office, MoSPI.';
export const PLFS_URL = 'https://microdata.gov.in/NADA/index.php/catalog/213';
export const PLFS_DATASET_URL = 'https://github.com/muhammedmueen/offerlens/tree/main/data/plfs-city-factors';
