import { z } from 'zod';

// The frontend NegotiationPanel owns this list; these are the only values it ever sends. The
// enum is the trust boundary — it rejects 'constructor'/'__proto__'/any unknown string with a
// 400 before the service runs, so a prototype key can never reach the template (NEG-8).
export const FOCUS_AREAS = ['salary', 'joining_bonus', 'benefits', 'equity', 'pto'] as const;

export const negotiateSchema = {
    params: z.object({
        id: z.string().uuid(),
    }),
    body: z.object({
        tone: z.enum(['professional', 'assertive', 'friendly']).optional().default('professional'),
        // .max(5) runs before .transform, so a 6-item spammy body is rejected rather than
        // silently shrunk; the Set dedupes ['salary','salary'] preserving first-seen order.
        focusAreas: z.array(z.enum(FOCUS_AREAS))
            .max(5)
            .transform((areas) => [...new Set(areas)])
            .optional(),
    }).optional(),
};
