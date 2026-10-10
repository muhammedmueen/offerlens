import { FastifyInstance } from 'fastify';
import { CareerService } from './career.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { requireFeature } from '@/middleware/require-feature.js';
import { tierForRequest } from '@/modules/quota/quota.service.js';
import { getCareerPathSchema } from './career.schema.js';

export async function careerRoutes(fastify: FastifyInstance) {
    const careerService = new CareerService(fastify);

    // GET /offers/:id/career-path
    fastify.get('/offers/:id/career-path', {
        preHandler: [requireRegistered, requireFeature('careerPath')],
        schema: getCareerPathSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const tier = await tierForRequest(req);
            const result = await careerService.generatePath(id, req.userId!, tier, req.aiSelection);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });
}
