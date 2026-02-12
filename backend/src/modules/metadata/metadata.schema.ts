import { z } from 'zod';

export const getRolesSchema = {
    querystring: z.object({
        q: z.string().optional(),
        category: z.string().optional(),
    }),
};

export const getCitiesSchema = {
    querystring: z.object({
        q: z.string().optional(),
        country: z.string().optional(),
    }),
};
