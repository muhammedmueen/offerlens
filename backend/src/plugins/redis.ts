import fp from 'fastify-plugin';
import { Redis } from 'ioredis';
import { config } from '@/config/index.js';
import type { FastifyPluginAsync } from 'fastify';

declare module 'fastify' {
    interface FastifyInstance {
        redis: Redis;
    }
}

const redisPlugin: FastifyPluginAsync = async (fastify) => {
    const redis = new Redis(config.REDIS_URL, {
        lazyConnect: true, // Don't connect immediately, wait for fastify ready
    });

    // Connect manually
    await redis.connect();

    fastify.log.info('Redis connected');

    fastify.decorate('redis', redis);

    fastify.addHook('onClose', async (instance) => {
        await instance.redis.quit();
        instance.log.info('Redis connection closed');
    });
};

export default fp(redisPlugin, {
    name: 'redis',
});
