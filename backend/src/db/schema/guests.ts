import { pgTable, uuid, text, inet, timestamp } from 'drizzle-orm/pg-core';

// The guest's daily analysis count used to live here as a rolling 24h window
// (analysis_count + daily_reset_at). It moved to quota_counters (task 4.3), keyed by the IST
// calendar day, so there is one source of truth for every daily limit.
export const guests = pgTable('guests', {
    id: uuid('id').defaultRandom().primaryKey(),
    fingerprint: text('fingerprint').notNull().unique(),
    ipAddress: inet('ip_address').notNull(),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
