import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import { RATE_LIMITS } from '@/config/constants.js';

export const registerRateLimiter = async (fastify: FastifyInstance) => {
    await fastify.register(rateLimit, {
        global: true,
        max: RATE_LIMITS.global.max,
        timeWindow: RATE_LIMITS.global.window,
        redis: fastify.redis, // Use shared Redis instance
        keyGenerator: (req) => {
            // Use Guest ID if available, otherwise IP
            // req.guestId is set by guest-identifier middleware
            return (req as any).guestId || req.ip;
        },
        errorResponseBuilder: (req, context) => {
            return {
                statusCode: 429,
                code: 'RATE_LIMIT_EXCEEDED',
                message: `Rate limit exceeded. Try again in ${context.after}.`,
            };
        },
    });
};
