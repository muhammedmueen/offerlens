import { FastifyInstance } from 'fastify';
import { routeLimit } from '@/middleware/rate-limiter.js';
import { BenefitsService } from './benefits.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { calculateBenefitsSchema } from './benefits.schema.js';

export async function benefitsRoutes(fastify: FastifyInstance) {
    const benefitsService = new BenefitsService();

    // POST /offers/:id/benefits
    fastify.post('/offers/:id/benefits', {
        ...routeLimit('benefits'),
        preHandler: [requireRegistered],
        schema: calculateBenefitsSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const body = req.body as { overrides?: Record<string, number> } | undefined;

            const result = await benefitsService.calculate(id, req.userId!, body?.overrides);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });
}
