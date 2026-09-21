import fp from 'fastify-plugin';
import type { Redis } from 'ioredis';
import { getRedis, closeRedis } from '@/shared/cache.js';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
    interface FastifyInstance {
        redis: Redis;
    }
}

/**
 * Decorates the instance with the PROCESS-WIDE client from `shared/cache.ts` rather than
 * creating its own.
 *
 * It used to construct a second `new Redis(...)`, which meant the salary cache (reachable from
 * the worker, where there is no Fastify instance) and rate limiting would have held separate
 * connections in the API process. One client, shared.
 */
const redisPlugin: FastifyPluginAsync = async (fastify) => {
    const redis = getRedis();

    // Explicit connect so boot FAILS FAST when Redis is unreachable, rather than every
    // rate-limited request discovering it later. The client is created with `lazyConnect`, so
    // this is the first thing to open the socket — but guard the status, because a reload could
    // re-register the plugin against an already-connected client.
    if (redis.status === 'wait') {
        await redis.connect();
    }

    fastify.log.info('Redis connected');

    fastify.decorate('redis', redis);

    fastify.addHook('onClose', async (instance) => {
        await closeRedis();
        instance.log.info('Redis connection closed');
    });
};

export default fp(redisPlugin, {
    name: 'redis',
});
