import { z } from 'zod';

export const negotiateSchema = {
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        tone: z.enum(['professional', 'assertive', 'friendly']).optional().default('professional'),
        focusAreas: z.array(z.string()).max(5).optional(),
    }).optional(),
};
