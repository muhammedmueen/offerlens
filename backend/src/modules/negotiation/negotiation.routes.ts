import { FastifyInstance } from 'fastify';
import { routeLimit } from '@/middleware/rate-limiter.js';
import { NegotiationService } from './negotiation.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { requireFeature } from '@/middleware/require-feature.js';
import { tierForRequest } from '@/modules/quota/quota.service.js';
import { negotiateSchema } from './negotiation.schema.js';

export async function negotiationRoutes(fastify: FastifyInstance) {
    const negotiationService = new NegotiationService(fastify);

    // POST /offers/:id/negotiate
    fastify.post('/offers/:id/negotiate', {
        ...routeLimit('negotiate'),
        preHandler: [requireRegistered, requireFeature('negotiationEmail')],
        schema: negotiateSchema,
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };
            const body = req.body as { tone?: string; focusAreas?: string[] };

            const tier = await tierForRequest(req);
            const script = await negotiationService.generateScript(id, req.userId!, tier, body, req.aiSelection);

            return reply.send({
                success: true,
                data: script,
            });
        },
    });
}
