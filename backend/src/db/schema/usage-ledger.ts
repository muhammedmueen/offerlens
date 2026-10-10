import { pgTable, uuid, text, integer, numeric, boolean, timestamp, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';
import { guests } from './guests.js';

/**
 * Append-only ledger of every billable AI/Vision call.
 *
 * ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
 * The only cost record used to be `analyses.aiMetadata.usage` (a jsonb blob), which is
 * cascade-deleted with its offer — and `cleanup.worker.ts` deletes expired guest offers
 * hourly, so guest spend evaporated within the hour. This table is separate so cost history
 * outlives the offer, the hourly cleanup AND account deletion.
 *
 * ── RECORDING RULE ───────────────────────────────────────────────────────────
 * One row per provider call: one per `complete()` invocation and one per Vision request.
 * Each row names the model that actually answered, so a fallback chain is priced per model.
 *   - `success = true`  only when the provider answered AND the caller's parser/validator
 *     accepted the response.
 *   - A response that came back but was rejected (bad JSON, schema mismatch) gets
 *     `success = false`, the real token counts, and `errorCode` 'invalid_json' /
 *     'schema_mismatch'.
 *   - A `complete()` that threw (429/5xx/network) gets `success = false`, 0 tokens, and
 *     `errorCode` 'provider_<status>' (or 'provider_error' with no numeric status). Vendors
 *     report no usage on an error response, so an errored call is recorded at 0 tokens; if a
 *     vendor ever bills one, we under-count it.
 *   - Code that never reached the provider (model resolution, a missing key, an offer not
 *     found) writes nothing.
 *
 * ── APPEND-ONLY ──────────────────────────────────────────────────────────────
 * There is no UPDATE or DELETE code path for this table anywhere (enforced in code, not by a
 * DB trigger — Drizzle can't express one and a hand-edited migration would break the
 * schema-only + db:generate workflow).
 *
 * `offer_id` deliberately has NO foreign key: a row must survive the offer's deletion. The
 * two owner FKs are `ON DELETE SET NULL` so a row survives user/guest deletion while losing
 * the dangling reference.
 */
export const usageLedger = pgTable('usage_ledger', {
    id: uuid('id').defaultRandom().primaryKey(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
    guestId: uuid('guest_id').references(() => guests.id, { onDelete: 'set null' }),
    offerId: uuid('offer_id'), // deliberately no FK: must outlive the offer
    purpose: text('purpose', { enum: ['analysis', 'metadata', 'career', 'negotiation', 'ocr'] }).notNull(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    thinkingTokens: integer('thinking_tokens').notNull().default(0),
    units: integer('units'),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6, mode: 'number' }),
    success: boolean('success').notNull(),
    errorCode: text('error_code'),
    billedTo: text('billed_to', { enum: ['platform', 'caller_key', 'mock'] }).notNull(),
}, (table) => ({
    userCreatedIdx: index('idx_usage_ledger_user_created').on(table.userId, table.createdAt),
    guestCreatedIdx: index('idx_usage_ledger_guest_created').on(table.guestId, table.createdAt),
    createdIdx: index('idx_usage_ledger_created_at').on(table.createdAt),
}));

export type UsageLedgerRow = typeof usageLedger.$inferSelect;
export type NewUsageLedgerRow = typeof usageLedger.$inferInsert;
