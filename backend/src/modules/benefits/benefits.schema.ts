import { z } from 'zod';

export const calculateBenefitsSchema = {
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        overrides: z.record(z.string(), z.number()).optional(),
    }).optional(),
};
