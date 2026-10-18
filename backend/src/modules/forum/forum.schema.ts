import { z } from 'zod';

// Fixed list (not free text) so the filter and the stored values agree. The frontend mirrors this
// in constants/api.ts. Rows written before this list existed may hold other values; they stay
// readable, they just cannot be filtered on.
export const FORUM_CATEGORIES = ['negotiation', 'career', 'advice', 'general'] as const;

const postId = z.object({ postId: z.string().uuid() });

export const listPostsSchema = {
    querystring: z.object({
        page: z.coerce.number().int().min(1).optional().default(1),
        category: z.enum(FORUM_CATEGORIES).optional(),
    }),
};

export const createPostSchema = {
    body: z.object({
        title: z.string().trim().min(3).max(200),
        content: z.string().trim().min(1).max(10000),
        category: z.enum(FORUM_CATEGORIES).optional().default('general'),
    }),
};

export const getPostSchema = { params: postId };

export const createCommentSchema = {
    params: postId,
    body: z.object({ content: z.string().trim().min(1).max(5000) }),
};
