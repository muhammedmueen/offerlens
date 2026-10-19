import { z } from 'zod';
import { CORRECTABLE_PATHS } from './correctable-fields.js';

// `field` is tightened to the allowlist for a 400 at the edge; the service check in
// CorrectionService remains the authoritative security boundary (export/history touch this
// table too). Imported from the shared allowlist so there is no third copy of the six paths.
const correctableField = z.enum(CORRECTABLE_PATHS as [string, ...string[]]);

export const applyCorrectionSchema = {
    params: z.object({ id: z.string().uuid() }),
    body: z.object({
        corrections: z.array(z.object({
            field: correctableField,
            correctedValue: z.any(),
        })).min(1).max(20),
    }),
};

export const getCorrectionsSchema = {
    params: z.object({ id: z.string().uuid() }),
};
