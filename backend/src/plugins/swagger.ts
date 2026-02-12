import fp from 'fastify-plugin';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { APP_VERSION } from '@/config/constants.js';
import type { FastifyPluginAsync } from 'fastify';

import { jsonSchemaTransform } from 'fastify-type-provider-zod';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(swagger, {
        openapi: {
            info: {
                title: 'OfferLens API',
                description: 'AI-powered offer letter analysis API',
                version: APP_VERSION,
            },
            servers: [
                {
                    url: 'http://localhost:8000',
                    description: 'Local development',
                },
            ],
            components: {
                securitySchemes: {
                    // No auth for Phase 1, but placeholder for Phase 2
                },
            },
        },
        transform: jsonSchemaTransform,
    });

    await fastify.register(swaggerUi, {
        routePrefix: '/api/v1/docs',
        uiConfig: {
            docExpansion: 'list',
            deepLinking: false,
        },
        staticCSP: true,
        transformStaticCSP: (header) => header,
    });
};

export default fp(swaggerPlugin, {
    name: 'swagger',
});
