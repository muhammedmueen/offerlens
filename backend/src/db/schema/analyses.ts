import { pgTable, uuid, integer, text, boolean, jsonb, timestamp, index } from 'drizzle-orm/pg-core';
import { offers } from './offers.js';

export const analyses = pgTable('analyses', {
    id: uuid('id').defaultRandom().primaryKey(),
    offerId: uuid('offer_id')
        .notNull()
        .unique()
        .references(() => offers.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    scoreLabel: text('score_label').notNull(), // excellent|good|fair|weak|poor
    scoringMethod: text('scoring_method').notNull().default('standard'), // standard|fallback
    extractedData: jsonb('extracted_data').notNull(),
    redFlags: jsonb('red_flags').notNull().default([]),
    salaryComparison: jsonb('salary_comparison').notNull(),
    negotiationSuggestions: jsonb('negotiation_suggestions').notNull().default([]),
    benefits: jsonb('benefits').notNull().default([]),
    takeHome: jsonb('take_home'),
    aiMetadata: jsonb('ai_metadata').notNull(),
    lowConfidence: boolean('low_confidence').notNull().default(false),
    redFlagsDiscarded: integer('red_flags_discarded').notNull().default(0),
    processingTimeMs: integer('processing_time_ms'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        scoreIdx: index('idx_analyses_score').on(table.score),
    };
});

export type Analysis = typeof analyses.$inferSelect;
export type NewAnalysis = typeof analyses.$inferInsert;
