import { FastifyInstance } from 'fastify';
import { SalaryService } from './salary.service.js';
import { submitSalarySchema, getSalaryStatsSchema } from './salary.schema.js';

export async function salaryRoutes(fastify: FastifyInstance) {
    const salaryService = new SalaryService();

    // POST /salaries — Submit salary data
    //
    // Was `/salary`. The frontend has always called `/salaries` and `/salaries/stats`,
    // so the Salary Explorer 404'd on both submit and read. Aligned to the plural
    // resource convention used by every other collection in this API.
    fastify.post('/salaries', {
        schema: submitSalarySchema,
        handler: async (req, reply) => {
            const body = req.body as {
                role: string;
                city: string;
                experienceYears: number;
                ctc: number;
                companyType: 'product' | 'service' | 'startup' | 'mnc' | 'other';
                companySize?: '1-10' | '11-50' | '51-200' | '201-1000' | '1000+';
            };

            await salaryService.submit({
                ...body,
                // Cooldown key only; never stored with the submission (task 4.6).
                fingerprint: req.guestId,
            });

            return reply.status(201).send({
                success: true,
                data: { message: 'Salary submitted successfully' },
            });
        },
    });

    // GET /salaries/stats — Aggregate statistics for a role + city
    fastify.get('/salaries/stats', {
        schema: getSalaryStatsSchema,
        handler: async (req, reply) => {
            const { role, city } = req.query as { role: string; city: string };

            const stats = await salaryService.getStats(role, city);

            return reply.send({
                success: true,
                data: stats,
            });
        },
    });
}
