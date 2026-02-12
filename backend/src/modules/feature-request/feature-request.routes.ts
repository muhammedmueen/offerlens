import { FastifyInstance } from 'fastify';
import { FeatureRequestService } from './feature-request.service.js';
import { createFeatureRequestSchema, getFeatureRequestsSchema } from './feature-request.schema.js';

export async function featureRequestRoutes(fastify: FastifyInstance) {
    const service = new FeatureRequestService();

    fastify.post('/', {
        schema: createFeatureRequestSchema,
        handler: async (req) => {
            const { title, description } = req.body as { title: string; description: string };
            const fingerprint = (req as any).guestId;
            const result = await service.create(title, description, fingerprint, req.ip);
            return { success: true, data: result };
        }
    });

    fastify.get('/', {
        schema: getFeatureRequestsSchema,
        handler: async (req) => {
            const { sort, status, page, pageSize } = req.query as {
                sort: 'votes' | 'newest' | 'oldest';
                status?: 'open' | 'planned' | 'in_progress' | 'done' | 'rejected';
                page: number;
                pageSize: number;
            };
            const fingerprint = (req as any).guestId;

            const result = await service.getList({
                sort, status, page, pageSize, fingerprint,
            });

            return { success: true, ...result };
        }
    });

    fastify.post('/:id/vote', {
        handler: async (req) => {
            const { id } = req.params as { id: string };
            const fingerprint = (req as any).guestId;
            const result = await service.vote(id, fingerprint, req.ip);
            return { success: true, data: result };
        }
    });
}
