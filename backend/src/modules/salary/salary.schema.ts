import { z } from 'zod';

/**
 * The schema file existed as an empty stub and the routes never referenced it, so
 * `POST /salaries` cast `req.body` and passed it straight to the insert. Omitting
 * `companyType` — a NOT NULL enum column — produced a database error rather than a 400.
 *
 * Bounds mirror `SalaryService.validate`, which rejects obviously fake submissions.
 */
export const submitSalarySchema = {
    body: z.object({
        role: z.string().trim().min(2).max(120),
        city: z.string().trim().min(2).max(120),
        experienceYears: z.coerce.number().int().min(0).max(60),
        ctc: z.coerce.number().int().positive().max(1_000_000_000),
        companyType: z.enum(['product', 'service', 'startup', 'mnc', 'other']),
        companySize: z.enum(['1-10', '11-50', '51-200', '201-1000', '1000+']).optional(),
        // Task 5.7. Absent = "Not sure" = stored NULL. null, '' and any other string are a 400.
        payBasis: z.enum(['current', 'offered']).optional(),
    }),
};

export const getSalaryStatsSchema = {
    querystring: z.object({
        role: z.string().trim().min(2).max(120),
        city: z.string().trim().min(2).max(120),
    }),
};
