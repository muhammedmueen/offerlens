import { z } from 'zod';

export const compareOffersSchema = {
    body: z.object({
        offerIds: z.array(z.string().uuid()).min(2, 'Comparison requires at least 2 offers').max(3, 'Maximum 3 offers for comparison'),
    }),
};
