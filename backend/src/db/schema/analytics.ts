import { pgTable, uuid, text, jsonb, inet, timestamp, index } from 'drizzle-orm/pg-core';
import { guests } from './guests.js';

export const analyticsEvents = pgTable('analytics_events', {
    id: uuid('id').defaultRandom().primaryKey(),
    event: text('event').notNull(),
    guestId: uuid('guest_id').references(() => guests.id),
    properties: jsonb('properties').notNull().default({}),
    ipAddress: inet('ip_address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        eventIdx: index('idx_analytics_event').on(table.event),
        createdIdx: index('idx_analytics_created').on(table.createdAt),
    };
});

export type AnalyticsEvent = typeof analyticsEvents.$inferSelect;
export type NewAnalyticsEvent = typeof analyticsEvents.$inferInsert;
