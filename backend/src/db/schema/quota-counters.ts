import { pgTable, uuid, text, integer, date, timestamp, primaryKey, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Relative, not `@/`: drizzle-kit loads schema files without the path alias.
import { QUOTA_FEATURES } from '../../config/plans.js';

/**
 * Daily quota counters (task 4.3): one row per subject, feature and IST calendar day.
 *
 * The single mechanism behind every daily limit — guest and registered analyses, and the
 * career / negotiation / autofill caps. A reservation is one atomic upsert whose
 * `DO UPDATE ... WHERE count < limit` re-checks under the row lock; see quota.service.ts.
 *
 * No foreign keys: `subject_id` is polymorphic (`users.id` or `guests.id`) and rows are
 * short-lived — the hourly cleanup deletes days older than two days.
 */
export const quotaCounters = pgTable('quota_counters', {
    subjectType: text('subject_type', { enum: ['user', 'guest'] }).notNull(),
    subjectId: uuid('subject_id').notNull(),
    feature: text('feature', { enum: QUOTA_FEATURES }).notNull(),
    day: date('day', { mode: 'string' }).notNull(),
    count: integer('count').notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => ({
    pk: primaryKey({ columns: [table.subjectType, table.subjectId, table.feature, table.day] }),
    subjectTypeCheck: check('quota_counters_subject_type_check', sql`${table.subjectType} IN ('user', 'guest')`),
    countCheck: check('quota_counters_count_check', sql`${table.count} >= 0`),
}));

export type QuotaCounter = typeof quotaCounters.$inferSelect;
