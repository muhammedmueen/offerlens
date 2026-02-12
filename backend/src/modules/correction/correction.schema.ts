import { z } from 'zod';

export const applyCorrectionSchema = {
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        corrections: z.array(z.object({
            field: z.string().min(1).max(200),
            correctedValue: z.any(),
        })).min(1).max(20),
    }),
};

export const getCorrectionsSchema = {
    params: z.object({ id: z.string().uuid() }),
};
