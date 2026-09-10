import { pgTable, uuid, text, real, timestamp, boolean, jsonb, index } from 'drizzle-orm/pg-core';
import { guests } from './guests.js';
import { users } from './users.js';

export const offers = pgTable('offers', {
    id: uuid('id').defaultRandom().primaryKey(),
    guestId: uuid('guest_id').references(() => guests.id),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    rawText: text('raw_text'),
    // Deliberately NOT globally unique. A global unique constraint meant two different
    // people uploading identical text collided: the second caller was handed the first
    // caller's offer ID, and if that offer had FAILED it was deleted out from under them.
    // Dedup is now scoped to the owner in OfferService.create (ADR-001).
    textHash: text('text_hash'),
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
        // Composite indexes matching the owner-scoped dedup lookups.
        userHashIdx: index('idx_offers_user_text_hash').on(table.userId, table.textHash),
        guestHashIdx: index('idx_offers_guest_text_hash').on(table.guestId, table.textHash),
        statusIdx: index('idx_offers_status').on(table.status),
        expiresIdx: index('idx_offers_expires_at').on(table.expiresAt), // Partial index not supported in Drizzle/pg-core typing easily yet, standard index fine for now
        createdIdx: index('idx_offers_created_at').on(table.createdAt),
    };
});

export type Offer = typeof offers.$inferSelect;
export type NewOffer = typeof offers.$inferInsert;
