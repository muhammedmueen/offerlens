import { z } from 'zod';
import { METRO_KEYS } from '../modules/salary/role-matching.js';
import { MIN_PLFS_RESPONDENTS, FACTOR_MIN, FACTOR_MAX } from '../modules/salary/city-adjustment.js';

/** Aggregate output of data/plfs-city-factors/build_city_factors.py. Resolved from the file URL so cwd does not matter. */
export const CITY_FACTORS_CSV_URL = new URL('../../../data/plfs-city-factors/city_factors.csv', import.meta.url);
/** Carries `constants.K` and `national.n`; aggregates only. */
export const CITY_FACTORS_REPORT_URL = new URL('../../../data/plfs-city-factors/build_report.json', import.meta.url);

export const CITY_FACTORS_CSV_HEADER = 'city,status,n_respondents,raw_ratio,shrinkage_weight,factor';

const num = (min: number, max: number) =>
    z.string().regex(/^\d+(\.\d+)?$/).transform(Number).pipe(z.number().min(min).max(max));

const publishedSchema = z.object({
    city: z.enum(METRO_KEYS as [string, ...string[]]),
    nRespondents: z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(MIN_PLFS_RESPONDENTS)),
    rawRatio: num(FACTOR_MIN, FACTOR_MAX),
    shrinkageWeight: num(0.001, 0.999),
    factor: z.string().regex(/^\d(\.\d{1,2})?$/).transform(Number).pipe(z.number().min(FACTOR_MIN).max(FACTOR_MAX)),
});
export type CityFactorCsvRow = z.infer<typeof publishedSchema>;

/**
 * Parse and validate the CSV text against the report's K (5..200). Returns every problem (callers print
 * the first few) so a bad file is rejected before any database write. Suppressed cities come back by
 * name only: they are never inserted, and absence is how the lookup knows a city has no factor.
 * ponytail: splits on commas because the pipeline guarantees no quoted fields; a quoted field fails the
 * field-count check loudly. Upgrade path: a CSV parser if the schema ever gains free text.
 */
export function parseCityFactorsCsv(text: string, K: number): { rows: CityFactorCsvRow[]; suppressed: string[]; problems: string[] } {
    const lines = text.split(/\r?\n/).filter((l) => l !== '');
    const problems: string[] = [];
    const rows: CityFactorCsvRow[] = [];
    const suppressed: string[] = [];
    if (!Number.isInteger(K) || K < 5 || K > 200) problems.push('K must be an integer from 5 to 200');
    if (lines[0] !== CITY_FACTORS_CSV_HEADER) problems.push(`header must be "${CITY_FACTORS_CSV_HEADER}"`);
    const seen = new Set<string>();
    lines.slice(1).forEach((line, i) => {
        const at = `line ${i + 2}`;
        const f = line.split(',');
        if (f.length !== 6) return void problems.push(`${at}: expected 6 fields, got ${f.length}`);
        const [city, status, n, raw, weight, factor] = f;
        if (!METRO_KEYS.includes(city)) return void problems.push(`${at}: city is not a known metro`);
        if (seen.has(city)) return void problems.push(`${at}: duplicate city ${city}`);
        seen.add(city);
        if (status === 'suppressed') {
            if (n !== '<30' || raw || weight || factor) problems.push(`${at}: a suppressed row must be "<30" with no other value`);
            else suppressed.push(city);
            return;
        }
        if (status !== 'published') return void problems.push(`${at}: status must be published or suppressed`);
        const parsed = publishedSchema.safeParse({ city, nRespondents: n, rawRatio: raw, shrinkageWeight: weight, factor });
        if (!parsed.success) return void problems.push(`${at}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
        const d = parsed.data;
        // The published columns are rounded (3 dp, 3 dp, 2 dp), so each check allows one unit of that rounding.
        if (Math.abs(d.shrinkageWeight - d.nRespondents / (d.nRespondents + K)) > 0.001) {
            problems.push(`${at}: shrinkage_weight is not n/(n+K)`);
        }
        if (Math.abs(d.factor - Math.exp(d.shrinkageWeight * Math.log(d.rawRatio))) > 0.0101) {
            problems.push(`${at}: factor is not exp(shrinkage_weight * ln(raw_ratio))`);
        }
        rows.push(d);
    });
    if (seen.size !== METRO_KEYS.length) problems.push(`expected exactly ${METRO_KEYS.length} cities, one row each`);
    return { rows, suppressed, problems };
}

const reportSchema = z.object({
    source: z.literal('plfs_2023_24'),
    constants: z.object({ K: z.number().int().min(5).max(200) }),
    national: z.object({ n: z.number().int().min(MIN_PLFS_RESPONDENTS) }),
});

/** K and national n from build_report.json, or a list of problems. */
export function parseCityFactorsReport(json: string): { K: number; nationalN: number } | { problems: string[] } {
    let raw: unknown;
    try { raw = JSON.parse(json); } catch { return { problems: ['build_report.json is not valid JSON'] }; }
    const parsed = reportSchema.safeParse(raw);
    return parsed.success
        ? { K: parsed.data.constants.K, nationalN: parsed.data.national.n }
        : { problems: parsed.error.issues.map((x) => `build_report.json ${x.path.join('.')} ${x.message}`) };
}
