import { FastifyInstance } from 'fastify';
import { APP_VERSION } from '@/config/constants.js';

export async function healthRoutes(fastify: FastifyInstance) {
    fastify.get('/health', async () => {
        return {
            status: 'ok',
            version: APP_VERSION,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        };
    });
}
