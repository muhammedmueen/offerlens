import { z } from 'zod';

export const getAnalysisSchema = {
    params: z.object({
        id: z.string().uuid(),
    }),
};
