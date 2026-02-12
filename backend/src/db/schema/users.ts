import { pgTable, uuid, text, boolean, timestamp, index } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
    id: uuid('id').defaultRandom().primaryKey(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash'),
    name: text('name'),
    avatarUrl: text('avatar_url'),
    googleId: text('google_id').unique(),
    isEmailVerified: boolean('is_email_verified').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        emailIdx: index('idx_users_email').on(table.email),
        googleIdIdx: index('idx_users_google_id').on(table.googleId),
    };
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
