import { pgTable, uuid, text, inet, integer, timestamp } from 'drizzle-orm/pg-core';

export const guests = pgTable('guests', {
    id: uuid('id').defaultRandom().primaryKey(),
    fingerprint: text('fingerprint').notNull().unique(),
    ipAddress: inet('ip_address').notNull(),
    analysisCount: integer('analysis_count').notNull().default(0),
    dailyResetAt: timestamp('daily_reset_at', { withTimezone: true }).notNull(),
    firstSeen: timestamp('first_seen', { withTimezone: true }).notNull().defaultNow(),
    lastSeen: timestamp('last_seen', { withTimezone: true }).notNull().defaultNow(),
});

export type Guest = typeof guests.$inferSelect;
export type NewGuest = typeof guests.$inferInsert;
