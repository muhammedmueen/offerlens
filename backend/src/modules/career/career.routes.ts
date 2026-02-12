import { FastifyInstance } from 'fastify';
import { CareerService } from './career.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { getCareerPathSchema } from './career.schema.js';

export async function careerRoutes(fastify: FastifyInstance) {
    const careerService = new CareerService(fastify);

    // GET /offers/:id/career-path
    fastify.get('/offers/:id/career-path', {
        preHandler: [requireRegistered],
        schema: getCareerPathSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const result = await careerService.generatePath(id, req.userId!);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });
}
