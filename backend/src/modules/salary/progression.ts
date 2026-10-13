import { SURVEY_DISCLAIMER_PREFIX, roleScope } from './benchmark-comparison.js';

/**
 * Career-path pay progression (Phase 5 task 5.5). Types and pure assembly, no I/O, so it is tested
 * without a database. The numbers come from `SalaryService.getProgression`, which reuses the
 * existing lookup (matchRole, bracketFromLabel, summarise, the n >= 10 floor). Nothing here
 * computes a statistic, and survey and crowdsourced cells are never combined.
 */

export type ProgressionSource = 'public_survey' | 'crowdsourced';
export type ProgressionReason = 'role_not_covered' | 'non_inr' | 'city_not_covered' | 'lookup_error';

export interface ProgressionCell {
    /** EXPERIENCE label, e.g. 'Junior (1-3 yrs)'. */
    bracket: string;
    /** Inclusive; max null = open end. Same expression `lookup()` uses for `experienceYearsRange`. */
    yearsRange: { min: number; max: number | null };
    /** Rows behind the number. For a thin cell: the survey row count. */
    sampleSize: number;
    /** Crowd rows after outlier rejection. Read only to render a thin cell. */
    crowdN: number;
    /** Null = not enough data; marketRange is then null too. */
    source: ProgressionSource | null;
    marketRange: { p25: number; p50: number; p75: number } | null;
    /** Change in p50 from the previous bracket, same source only. */
    step: { absolute: number; percent: number } | null;
}

export interface ProgressionNote { source: ProgressionSource; disclaimer: string }

export interface Progression {
    applicable: boolean;
    reason?: ProgressionReason;
    roleUsed?: string;
    cityUsed?: string;
    referenceFamilies?: readonly string[];
    currentBracket?: string | null;
    cells?: ProgressionCell[];
    notes?: ProgressionNote[];
}

/**
 * Fills `step` on each cell. A step needs this cell and the one directly before it to both have
 * numbers from the SAME source; across a gap or a source boundary it stays null (comparing
 * sources would be pooling in spirit). Arithmetic is on the already-rounded p50s.
 */
export function addSteps(cells: ProgressionCell[]): ProgressionCell[] {
    return cells.map((c, i) => {
        const prev = cells[i - 1];
        if (!prev || !c.marketRange || !prev.marketRange || !c.source || c.source !== prev.source) {
            return { ...c, step: null };
        }
        const absolute = c.marketRange.p50 - prev.marketRange.p50;
        // prev p50 > 0: it passed summarise(), which drops non-positive values.
        return { ...c, step: { absolute, percent: Math.round((absolute / prev.marketRange.p50) * 100) } };
    });
}

/**
 * The survey note is always present (the table shows survey n even when every cell is thin, so
 * the ODbL attribution applies). The crowd note appears only if a cell came from crowd rows. No
 * sample size is ever interpolated: n is per row and lives in the table.
 */
export function progressionNotes(cells: readonly ProgressionCell[], families: readonly string[]): ProgressionNote[] {
    const notes: ProgressionNote[] = [{
        source: 'public_survey',
        disclaimer: `${SURVEY_DISCLAIMER_PREFIX} India-wide figures from the Stack Overflow Developer Survey 2025 `
            + `(${roleScope(families)}, all cities). Each row compares different people at that level of experience; `
            + 'it is not a forecast of your own raises. The survey skews toward junior respondents, so senior rows are often thin.',
    }];
    if (cells.some((c) => c.source === 'crowdsourced')) {
        notes.push({
            source: 'crowdsourced',
            disclaimer: 'Rows marked "crowdsourced" are unverified submissions for this role and city. Some may be offered, not current, pay.',
        });
    }
    return notes;
}
