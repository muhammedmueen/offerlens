import fp from 'fastify-plugin';
import cookie from '@fastify/cookie';
import { config } from '@/config/index.js';
import { guestIdentifier } from '@/middleware/guest-identifier.js';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Guest identity (ADR-001).
 *
 * The cookie plugin and the guestIdentifier hook are registered together, in this
 * order, deliberately: @fastify/cookie installs its own onRequest parser, and
 * guestIdentifier depends on `request.cookies` already being populated. Adding the
 * hook at the root of app.ts instead would leave that ordering to chance.
 *
 * This plugin loads before the rate limiter is registered, so `request.guestId` is
 * set by the time the limiter's keyGenerator runs.
 */
const guestIdentityPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(cookie, {
        secret: config.COOKIE_SECRET ?? config.JWT_SECRET,
    });

    fastify.addHook('onRequest', guestIdentifier);
};

export default fp(guestIdentityPlugin, {
    name: 'guest-identity',
});
