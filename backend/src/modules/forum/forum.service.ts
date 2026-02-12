import { db } from '@/db/index.js';
import { forumPosts, forumComments } from '@/db/schema/forum.js';
import { users } from '@/db/schema/users.js';
import { eq, desc, sql } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export class ForumService {
    async listPosts(page: number, category?: string) {
        const limit = 20;
        const offset = (page - 1) * limit;

        const whereClause = category ? eq(forumPosts.category, category) : undefined;

        const posts = await db.select({
            id: forumPosts.id,
            title: forumPosts.title,
            category: forumPosts.category,
            viewCount: forumPosts.viewCount,
            createdAt: forumPosts.createdAt,
            authorName: users.name,
            authorAvatar: users.avatarUrl,
            commentCount: sql<number>`(select count(*) from ${forumComments} where ${forumComments.postId} = ${forumPosts.id})`,
        })
            .from(forumPosts)
            .leftJoin(users, eq(forumPosts.userId, users.id))
            .where(whereClause)
            .orderBy(desc(forumPosts.createdAt))
            .limit(limit)
            .offset(offset);

        return posts;
    }

    async createPost(userId: string, input: { title: string; content: string; category: string }) {
        const [post] = await db.insert(forumPosts).values({
            userId,
            ...input,
        }).returning();

        return post;
    }

    async getPost(postId: string) {
        // Fetch post details manually
        const [post] = await db.select()
            .from(forumPosts)
            .where(eq(forumPosts.id, postId));

        if (!post) throw new AppError(ERROR_CODES.NOT_FOUND, 'Post not found', 404);

        // Increment view count (fire and forget)
        await db.update(forumPosts)
            .set({ viewCount: sql`${forumPosts.viewCount} + 1` })
            .where(eq(forumPosts.id, postId));

        // Fetch author details
        const author = await db.query.users.findFirst({
            where: eq(users.id, post.userId!),
            columns: { id: true, name: true, avatarUrl: true },
        });

        // Fetch comments with authors
        const comments = await db.select({
            id: forumComments.id,
            content: forumComments.content,
            createdAt: forumComments.createdAt,
            authorName: users.name,
            authorAvatar: users.avatarUrl,
            authorId: users.id,
        })
            .from(forumComments)
            .leftJoin(users, eq(forumComments.userId, users.id))
            .where(eq(forumComments.postId, postId))
            .orderBy(sql`${forumComments.createdAt} ASC`);

        return {
            ...post,
            author,
            comments,
        };
    }

    async createComment(userId: string, postId: string, content: string) {
        const post = await db.query.forumPosts.findFirst({ where: eq(forumPosts.id, postId) });
        if (!post) throw new AppError(ERROR_CODES.NOT_FOUND, 'Post not found', 404);

        const [comment] = await db.insert(forumComments).values({
            userId,
            postId,
            content,
        }).returning();

        return comment;
    }
}
