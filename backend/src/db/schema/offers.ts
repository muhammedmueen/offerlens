import { pgTable, uuid, text, real, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { guests } from './guests.js';
import { users } from './users.js';

export const offers = pgTable('offers', {
    id: uuid('id').defaultRandom().primaryKey(),
    guestId: uuid('guest_id').references(() => guests.id),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    rawText: text('raw_text'),
    textHash: text('text_hash').unique(),
    ocrConfidence: real('ocr_confidence'),
    status: text('status', { enum: ['QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED'] })
        .notNull()
        .default('QUEUED'),
    userContext: jsonb('user_context'),
    failureReason: text('failure_reason'),
    isGuest: boolean('is_guest').notNull().default(true),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        guestIdx: index('idx_offers_guest_id').on(table.guestId),
        textHashIdx: index('idx_offers_text_hash').on(table.textHash),
        statusIdx: index('idx_offers_status').on(table.status),
        expiresIdx: index('idx_offers_expires_at').on(table.expiresAt), // Partial index not supported in Drizzle/pg-core typing easily yet, standard index fine for now
        createdIdx: index('idx_offers_created_at').on(table.createdAt),
    };
});

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
