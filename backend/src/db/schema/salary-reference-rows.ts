import { pgTable, uuid, text, integer, doublePrecision, timestamp, index, uniqueIndex, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/**
 * Public-survey salary reference rows (Phase 5 Phase A): the cleaned Stack Overflow Developer Survey
 * 2025 India subset from data/so-2025-india/, loaded by `npm run db:load-reference`.
 *
 * Deliberately separate from `salary_submissions`: reference and crowdsourced rows are never pooled.
 * Holds no user, guest or fingerprint data. `source_row_id` is the anonymous survey ResponseId.
 * `city` NULL means national (always NULL in Phase A; never invent a city).
 *
 * Relative-only imports: drizzle-kit loads schema files without the `@/` alias.
 */
export const salaryReferenceRows = pgTable('salary_reference_rows', {
    id: uuid('id').primaryKey().defaultRandom(),
    source: text('source').notNull(),
    sourceVersion: text('source_version').notNull(),
    sourceRowId: text('source_row_id').notNull(),
    licence: text('licence').notNull(),
    collectedAt: timestamp('collected_at', { withTimezone: true }).notNull(),
    /** Seed role label verbatim, original case (e.g. 'Backend Engineer'). */
    role: text('role').notNull(),
    city: text('city'),
    experienceYears: integer('experience_years').notNull(),
    /** Annual INR, whole rupees. */
    ctc: integer('ctc').notNull(),
    // Always NULL in Phase A; same enums as salary_submissions (TS-level only).
    companyType: text('company_type', { enum: ['product', 'service', 'startup', 'mnc', 'other'] }),
    companySize: text('company_size', { enum: ['1-10', '11-50', '51-200', '201-1000', '1000+'] }),
    /** Survey weight. 1 for Stack Overflow; reserved for PLFS in Phase B. */
    weight: doublePrecision('weight').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    lookupIdx: index('idx_salary_ref_lookup').on(table.source, table.role, table.experienceYears),
    rowUnique: uniqueIndex('uq_salary_ref_row').on(table.source, table.sourceVersion, table.sourceRowId),
    ctcCheck: check('salary_reference_rows_ctc_check', sql`${table.ctc} > 0`),
    experienceCheck: check('salary_reference_rows_experience_check', sql`${table.experienceYears} BETWEEN 0 AND 60`),
    weightCheck: check('salary_reference_rows_weight_check', sql`${table.weight} > 0`),
}));

export type SalaryReferenceRow = typeof salaryReferenceRows.$inferSelect;
