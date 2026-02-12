import { FastifyInstance } from 'fastify';
import { NegotiationService } from './negotiation.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { negotiateSchema } from './negotiation.schema.js';

export async function negotiationRoutes(fastify: FastifyInstance) {
    const negotiationService = new NegotiationService(fastify);

    // POST /offers/:id/negotiate
    fastify.post('/offers/:id/negotiate', {
        preHandler: [requireRegistered],
        schema: negotiateSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const body = req.body as { tone?: string; focusAreas?: string[] };

            const script = await negotiationService.generateScript(id, req.userId!, body);

            return reply.send({
                success: true,
                data: script,
            });
        },
    });
}
