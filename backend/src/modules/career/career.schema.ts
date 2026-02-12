import { z } from 'zod';

export const getCareerPathSchema = {
    params: z.object({ id: z.string().uuid() }),
};
