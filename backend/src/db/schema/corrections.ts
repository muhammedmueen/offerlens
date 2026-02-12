import { pgTable, uuid, text, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
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
    };
});

export type Correction = typeof corrections.$inferSelect;
export type NewCorrection = typeof corrections.$inferInsert;
