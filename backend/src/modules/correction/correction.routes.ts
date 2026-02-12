import { FastifyInstance } from 'fastify';
import { CorrectionService } from './correction.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { applyCorrectionSchema, getCorrectionsSchema } from './correction.schema.js';

export async function correctionRoutes(fastify: FastifyInstance) {
    const correctionService = new CorrectionService();

    // PATCH /offers/:id/corrections
    fastify.patch('/offers/:id/corrections', {
        preHandler: [requireRegistered],
        schema: applyCorrectionSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const { corrections: correctionItems } = req.body as {
                corrections: Array<{ field: string; correctedValue: unknown }>;
            };

            const result = await correctionService.applyCorrections(id, req.userId!, correctionItems);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });

    // GET /offers/:id/corrections
    fastify.get('/offers/:id/corrections', {
        preHandler: [requireRegistered],
        schema: getCorrectionsSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const result = await correctionService.getCorrections(id, req.userId!);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });
}
