import { FastifyInstance } from 'fastify';
import { MetadataService } from './metadata.service.js';
import { getRolesSchema, getCitiesSchema } from './metadata.schema.js';

export async function metadataRoutes(fastify: FastifyInstance) {
    const metadataService = new MetadataService();

    fastify.get('/roles', {
        schema: getRolesSchema,
        handler: async (req) => {
            const { q, category } = req.query as { q?: string; category?: string };
            const data = await metadataService.getRoles(q, category);
            return { success: true, data };
        },
    });

    fastify.get('/cities', {
        schema: getCitiesSchema,
        handler: async (req) => {
            const { q, country } = req.query as { q?: string; country?: string };
            const data = await metadataService.getCities(q, country);
            return { success: true, data };
        },
    });

    fastify.get('/experience-levels', {
        handler: async () => {
            const data = await metadataService.getExperienceLevels();
            return { success: true, data };
        },
    });
}
