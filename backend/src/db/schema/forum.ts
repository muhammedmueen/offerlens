import { pgTable, uuid, text, timestamp, integer, index } from 'drizzle-orm/pg-core';
import { users } from './users.js';

export const forumPosts = pgTable('forum_posts', {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
    title: text('title').notNull(),
    content: text('content').notNull(),
    category: text('category').notNull().default('general'), // negotiation, career, advice, general
    viewCount: integer('view_count').default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        userIdx: index('idx_forum_posts_user').on(table.userId),
        createdIdx: index('idx_forum_posts_created').on(table.createdAt),
    };
});

export const forumComments = pgTable('forum_comments', {
    id: uuid('id').defaultRandom().primaryKey(),
    postId: uuid('post_id')
        .notNull()
        .references(() => forumPosts.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => {
    return {
        postIdx: index('idx_forum_comments_post').on(table.postId),
    };
});

export type ForumPost = typeof forumPosts.$inferSelect;
export type NewForumPost = typeof forumPosts.$inferInsert;
export type ForumComment = typeof forumComments.$inferSelect;
export type NewForumComment = typeof forumComments.$inferInsert;
