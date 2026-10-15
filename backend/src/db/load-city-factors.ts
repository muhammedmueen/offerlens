import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { and, eq } from 'drizzle-orm';
import { db, conn } from './index.js';
import { cityPayFactors } from './schema/city-pay-factors.js';
import {
    CITY_FACTORS_CSV_URL, CITY_FACTORS_REPORT_URL, parseCityFactorsCsv, parseCityFactorsReport,
} from './city-factors-csv.js';
import { PLFS_SOURCE } from '../modules/salary/city-adjustment.js';

/**
 * Loads data/plfs-city-factors/city_factors.csv into city_pay_factors (aggregates only).
 * Idempotent: one transaction deletes this source + version, then re-inserts, so a re-run yields the
 * same table. Suppressed cities are not inserted. Touches nothing else and never Redis: the lookup
 * reads this table per survey-tier request, so the next request sees the new factors.
 */
async function loadCityFactors() {
    console.log('📥 Loading PLFS city pay factors...');

    try {
        const report = parseCityFactorsReport(readFileSync(fileURLToPath(CITY_FACTORS_REPORT_URL), 'utf8'));
        if ('problems' in report) {
            console.error('❌ invalid build_report.json:');
            report.problems.slice(0, 10).forEach((p) => console.error(`   ${p}`));
            process.exit(1);
        }
        const { rows, suppressed, problems } = parseCityFactorsCsv(
            readFileSync(fileURLToPath(CITY_FACTORS_CSV_URL), 'utf8'), report.K);
        if (problems.length > 0) {
            console.error(`❌ ${problems.length} invalid CSV problem(s); first 10:`);
            problems.slice(0, 10).forEach((p) => console.error(`   ${p}`));
            process.exit(1);
        }

        const { source, sourceVersion, licence, referencePeriodEnd } = PLFS_SOURCE;
        await db.transaction(async (tx) => {
            await tx
                .delete(cityPayFactors)
                .where(and(eq(cityPayFactors.source, source), eq(cityPayFactors.sourceVersion, sourceVersion)));
            if (rows.length > 0) {
                await tx.insert(cityPayFactors).values(rows.map((r) => ({
                    source,
                    sourceVersion,
                    city: r.city,
                    nRespondents: r.nRespondents,
                    nationalN: report.nationalN,
                    rawRatio: r.rawRatio,
                    shrinkageWeight: r.shrinkageWeight,
                    factor: r.factor,
                    licence,
                    referencePeriodEnd: new Date(referencePeriodEnd),
                })));
            }
        });

        console.log(`✅ Loaded ${rows.length} city factors (${source} ${sourceVersion}); suppressed: ${suppressed.join(', ') || 'none'}`);
        rows.forEach((r) => console.log(`   ${r.city}: n=${r.nRespondents} factor=${r.factor}`));
    } catch (error) {
        console.error('❌ Loading city factors failed:', error);
        process.exit(1);
    } finally {
        await conn.end();
    }
}

loadCityFactors();
