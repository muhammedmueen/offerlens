import { pgTable, uuid, text, integer, doublePrecision, timestamp, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Task 5.1b: per-city pay factors derived from PLFS 2023-24 (data/plfs-city-factors/), loaded by
 * `npm run db:load-city-factors`. At most six rows per source version, aggregates only: no column could
 * hold a respondent-level value. A suppressed city (n < 30) has NO row; absence means "no factor".
 *
 * Deliberately separate from `salary_reference_rows` (ODbL) and `salary_submissions`, so removing PLFS
 * is a DROP TABLE. The bounds below match the builder (G5), the CSV parser and `isUsableFactor`.
 *
 * Relative-only imports: drizzle-kit loads schema files without the `@/` alias.
 */
export const cityPayFactors = pgTable('city_pay_factors', {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    sourceVersion: text('source_version').notNull(),
    /** Canonical metro key, as in role-matching.ts: 'bangalore', 'delhi ncr', ... */
    city: text('city').notNull(),
    /** Unweighted sampled persons in the city group (>= 30). */
    nRespondents: integer('n_respondents').notNull(),
    nationalN: integer('national_n').notNull(),
    rawRatio: doublePrecision('raw_ratio').notNull(),
    shrinkageWeight: doublePrecision('shrinkage_weight').notNull(),
    /** Already rounded to 2 dp: the number shown to a user is the number that was multiplied. */
    factor: doublePrecision('factor').notNull(),
    licence: text('licence').notNull(),
    referencePeriodEnd: timestamp('reference_period_end', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    rowUnique: uniqueIndex('uq_city_pay_factor').on(table.source, table.sourceVersion, table.city),
    nCheck: check('city_pay_factors_n_check', sql`${table.nRespondents} >= 30`),
    nationalNCheck: check('city_pay_factors_national_n_check', sql`${table.nationalN} >= 30`),
    ratioCheck: check('city_pay_factors_ratio_check', sql`${table.rawRatio} BETWEEN 0.5 AND 2.0`),
    weightCheck: check('city_pay_factors_weight_check', sql`${table.shrinkageWeight} > 0 AND ${table.shrinkageWeight} < 1`),
    factorCheck: check('city_pay_factors_factor_check', sql`${table.factor} BETWEEN 0.5 AND 2.0`),
}));

export type CityPayFactor = typeof cityPayFactors.$inferSelect;
