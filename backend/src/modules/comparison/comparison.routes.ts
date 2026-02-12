import { FastifyInstance } from 'fastify';
import { ComparisonService } from './comparison.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { compareOffersSchema } from './comparison.schema.js';

export async function comparisonRoutes(fastify: FastifyInstance) {
    const comparisonService = new ComparisonService(fastify);

    // POST /offers/compare
    fastify.post('/offers/compare', {
        preHandler: [requireRegistered],
        schema: compareOffersSchema,
        handler: async (req, reply) => {
            const { offerIds } = req.body as { offerIds: string[] };
            const result = await comparisonService.compare(offerIds, req.userId!);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });
}
