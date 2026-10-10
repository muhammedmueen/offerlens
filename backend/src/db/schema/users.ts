import { pgTable, uuid, text, boolean, timestamp, index, check } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
// Relative, not `@/`: drizzle-kit loads schema files without the path alias.
import { PLAN_IDS, DEFAULT_PLAN } from '../../config/plans.js';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    googleId: text('google_id').unique(),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    // Task 4.2. A CHECK rather than a pgEnum: adding a plan later is a drop-and-recreate of
    // the constraint in one transactional migration, without ALTER TYPE's caveats.
    plan: text('plan', { enum: PLAN_IDS }).notNull().default(DEFAULT_PLAN),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        emailIdx: index('idx_users_email').on(table.email),
        googleIdIdx: index('idx_users_google_id').on(table.googleId),
        planCheck: check(
            'users_plan_check',
            sql`${table.plan} IN (${sql.raw(PLAN_IDS.map((p) => `'${p}'`).join(', '))})`,
        ),
    };
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
