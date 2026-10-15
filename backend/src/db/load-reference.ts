import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { db, conn } from './index.js';
import { salaryReferenceRows } from './schema/salary-reference-rows.js';
import { REFERENCE_CSV_URL, parseReferenceCsv } from './reference-csv.js';
import { REFERENCE_SOURCE } from '../modules/salary/reference-source.js';

const CHUNK = 500;

/**
 * Loads data/so-2025-india/reference_rows.csv into salary_reference_rows.
 * Idempotent: one transaction deletes this source + version, then re-inserts, so a re-run yields the
 * same table. Touches nothing else (never salary_submissions). Rows are national (city NULL).
 */
async function loadReference() {
    console.log('📥 Loading salary reference rows...');

    try {
        const { rows, problems } = parseReferenceCsv(readFileSync(fileURLToPath(REFERENCE_CSV_URL), 'utf8'));
        if (problems.length > 0) {
            console.error(`❌ ${problems.length} invalid CSV problem(s); first 10:`);
            problems.slice(0, 10).forEach((p) => console.error(`   ${p}`));
            process.exit(1);
        }

        const { source, sourceVersion, licence, collectedAt } = REFERENCE_SOURCE;
        await db.transaction(async (tx) => {
            await tx
                .delete(salaryReferenceRows)
                .where(and(eq(salaryReferenceRows.source, source), eq(salaryReferenceRows.sourceVersion, sourceVersion)));
            for (let i = 0; i < rows.length; i += CHUNK) {
                await tx.insert(salaryReferenceRows).values(
                    rows.slice(i, i + CHUNK).map((r) => ({
                        source,
                        sourceVersion,
                        sourceRowId: r.sourceRowId,
                        licence,
                        collectedAt: new Date(collectedAt),
                        role: r.role,
                        city: null, // Phase A is national; never invent a city
                        experienceYears: r.experienceYears,
                        ctc: r.ctc,
                        weight: 1,
                    })),
                );
            }
        });

        const perRole = new Map<string, number>();
        for (const r of rows) perRole.set(r.role, (perRole.get(r.role) ?? 0) + 1);
        console.log(`✅ Loaded ${rows.length} rows (${source} ${sourceVersion})`);
        [...perRole].sort().forEach(([role, n]) => console.log(`   ${role}: ${n}`));
    } catch (error) {
        console.error('❌ Loading reference rows failed:', error);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

loadReference();
