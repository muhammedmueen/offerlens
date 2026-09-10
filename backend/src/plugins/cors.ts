import fp from 'fastify-plugin';
import cors from '@fastify/cors';
import { config } from '@/config/index.js';
import type { FastifyPluginAsync } from 'fastify';

const corsPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(cors, {
        origin: config.CORS_ORIGIN,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
        // X-Fingerprint removed: guest identity is a signed httpOnly cookie (ADR-001).
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
        // Required for the guest identity cookie to be sent cross-origin.
        credentials: true,
    });
};

export default fp(corsPlugin, {
    name: 'cors',
});
