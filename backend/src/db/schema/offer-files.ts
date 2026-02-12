import { pgTable, uuid, text, integer, boolean, timestamp } from 'drizzle-orm/pg-core';
import { offers } from './offers.js';

export const offerFiles = pgTable('offer_files', {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
        .notNull()
        .references(() => offers.id, { onDelete: 'cascade' }),
    originalName: text('original_name').notNull(),
    storedPath: text('stored_path').notNull(),
    mimeType: text('mime_type').notNull(),
    fileSizeBytes: integer('file_size_bytes').notNull(),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

export type OfferFile = typeof offerFiles.$inferSelect;
export type NewOfferFile = typeof offerFiles.$inferInsert;
