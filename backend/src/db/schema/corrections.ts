import { pgTable, uuid, text, jsonb, timestamp, index, uniqueIndex } from 'drizzle-orm/pg-core';
import { offers } from './offers.js';
import { users } from './users.js';

export const corrections = pgTable('corrections', {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
        .notNull()
        .references(() => offers.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    field: text('field').notNull(),
    originalValue: jsonb('original_value'),
    correctedValue: jsonb('corrected_value'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        offerIdx: index('idx_corrections_offer').on(table.offerId),
        userIdx: index('idx_corrections_user').on(table.userId),
        // COR-1 / COR-4: one correction per (offer, field). The service upserts on this target,
        // so re-saving the same fix updates the audit row instead of inserting a duplicate.
        // The redundant idx_corrections_offer (its leading column) is left in place; dropping it
        // is a later contract-step migration.
        offerFieldUniq: uniqueIndex('uq_corrections_offer_field').on(table.offerId, table.field),
    };
});

export type Correction = typeof corrections.$inferSelect;
export type NewCorrection = typeof corrections.$inferInsert;
