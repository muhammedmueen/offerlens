import { z } from 'zod';

export const createFeatureRequestSchema = {
    body: z.object({
        title: z.string().min(5).max(200),
        description: z.string().min(20).max(2000),
    }),
};

export const getFeatureRequestsSchema = {
    querystring: z.object({
        sort: z.enum(['votes', 'newest', 'oldest']).optional().default('votes'),
        status: z.enum(['open', 'planned', 'in_progress', 'done', 'rejected']).optional(),
        page: z.coerce.number().int().min(1).optional().default(1),
        pageSize: z.coerce.number().int().min(1).max(50).optional().default(20),
    }),
};
