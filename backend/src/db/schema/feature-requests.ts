import { pgTable, uuid, text, integer, inet, timestamp, index, unique } from 'drizzle-orm/pg-core';

export const featureRequests = pgTable('feature_requests', {
    id: uuid('id').defaultRandom().primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    status: text('status', { enum: ['open', 'planned', 'in_progress', 'done', 'rejected'] })
        .notNull()
        .default('open'),
    voteCount: integer('vote_count').notNull().default(0),
    submittedByFingerprint: text('submitted_by_fingerprint').notNull(),
    submittedByIp: inet('submitted_by_ip').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        voteCountIdx: index('idx_fr_vote_count').on(table.voteCount), // Add DESC via raw SQL migration if needed, but standard index helps too
    };
});

export const featureRequestVotes = pgTable('feature_request_votes', {
    id: uuid('id').defaultRandom().primaryKey(),
    featureRequestId: uuid('feature_request_id')
        .notNull()
        .references(() => featureRequests.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    ipAddress: inet('ip_address').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        uniqueVote: unique('idx_frv_unique').on(table.featureRequestId, table.fingerprint),
    };
});

export type FeatureRequest = typeof featureRequests.$inferSelect;
export type NewFeatureRequest = typeof featureRequests.$inferInsert;
