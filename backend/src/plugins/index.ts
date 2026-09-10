import type { FastifyPluginAsync } from 'fastify';
import databasePlugin from './database.js';
import redisPlugin from './redis.js';
import corsPlugin from './cors.js';
import swaggerPlugin from './swagger.js';
import multipartPlugin from './multipart.js';
import guestIdentityPlugin from './guest-identity.js';

import fp from 'fastify-plugin';

const registerPluginsCallback: FastifyPluginAsync = async (fastify) => {
    await fastify.register(databasePlugin);
    await fastify.register(redisPlugin);
    await fastify.register(corsPlugin);
    await fastify.register(swaggerPlugin);
    await fastify.register(multipartPlugin);
    // Must load before the rate limiter so its keyGenerator sees request.guestId.
    await fastify.register(guestIdentityPlugin);
};

export const registerPlugins = fp(registerPluginsCallback, {
    name: 'register-plugins',
});
