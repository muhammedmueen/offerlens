import { z } from 'zod';
import { REFERENCE_FAMILIES } from './seed-data.js';

/** Published, cleaned Stack Overflow 2025 India rows. Resolved from the file URL so cwd does not matter. */
export const REFERENCE_CSV_URL = new URL('../../../data/so-2025-india/reference_rows.csv', import.meta.url);

export const REFERENCE_CSV_HEADER = 'source_row_id,role,experience_years,ctc';

// Same bounds as data/so-2025-india/build_reference.py (CTC_MIN, CTC_MAX).
export const CTC_MIN = 100_000;
export const CTC_MAX = 50_000_000;

const int = (min: number, max: number) =>
    z.string().regex(/^\d+$/).transform(Number).pipe(z.number().int().min(min).max(max));

const rowSchema = z.object({
    sourceRowId: z.string().regex(/^\d+$/),
    role: z.enum(REFERENCE_FAMILIES),
    experienceYears: int(0, 60),
    ctc: int(CTC_MIN, CTC_MAX),
});
export type ReferenceCsvRow = z.infer<typeof rowSchema>;

/**
 * Parse and validate the CSV text. Returns every problem (callers print the first few) so a bad file
 * is rejected before any database write.
 * ponytail: splits on commas because the pipeline guarantees no quoted fields; a quoted field fails
 * the field-count check loudly. Upgrade path: a CSV parser if the schema ever gains free text.
 */
export function parseReferenceCsv(text: string): { rows: ReferenceCsvRow[]; problems: string[] } {
    const lines = text.split(/\r?\n/).filter((l) => l !== '');
    const problems: string[] = [];
    const rows: ReferenceCsvRow[] = [];
    if (lines[0] !== REFERENCE_CSV_HEADER) problems.push(`header must be "${REFERENCE_CSV_HEADER}"`);
    const seen = new Set<string>();
    lines.slice(1).forEach((line, i) => {
        const at = `line ${i + 2}`;
        const f = line.split(',');
        if (f.length !== 4) return void problems.push(`${at}: expected 4 fields, got ${f.length}`);
        const parsed = rowSchema.safeParse({ sourceRowId: f[0], role: f[1], experienceYears: f[2], ctc: f[3] });
        if (!parsed.success) return void problems.push(`${at}: ${parsed.error.issues.map((x) => `${x.path.join('.')} ${x.message}`).join('; ')}`);
        if (seen.has(parsed.data.sourceRowId)) return void problems.push(`${at}: duplicate source_row_id ${parsed.data.sourceRowId}`);
        seen.add(parsed.data.sourceRowId);
        rows.push(parsed.data);
    });
    return { rows, problems };
}
