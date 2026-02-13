import { FastifyInstance } from 'fastify';
import { SalaryService } from './salary.service.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export async function salaryRoutes(fastify: FastifyInstance) {
    const salaryService = new SalaryService();

    // POST /salary — Submit salary data
    fastify.post('/salary', async (req, reply) => {
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
            userId: req.userId,
            fingerprint: req.guestId,
        });

        return reply.status(201).send({
            success: true,
            data: { message: 'Salary submitted successfully' },
        });
    });

    // GET /salary — Get salary statistics
    fastify.get('/salary', async (req, reply) => {
        const { role, city } = req.query as { role?: string; city?: string };

        if (!role || !city) {
            throw new AppError(ERROR_CODES.INVALID_INPUT, 'Role and city are required', 400);
        }

        const stats = await salaryService.getStats(role, city);

        return reply.send({
            success: true,
            data: stats,
        });
    });
}
