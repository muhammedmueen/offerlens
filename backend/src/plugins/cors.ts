import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { config } from '@/config/index.js';
import type { FastifyPluginAsync } from 'fastify';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(cors, {
        origin: config.CORS_ORIGIN,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Fingerprint', 'X-Request-Id'],
        credentials: true,
    });
};

export default fp(corsPlugin, {
    name: 'cors',
});
