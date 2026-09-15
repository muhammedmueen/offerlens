import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { routeLimit } from '@/middleware/rate-limiter.js';
import { signupSchema, loginSchema, googleAuthSchema, refreshTokenSchema } from './auth.schema.js';

export async function authRoutes(fastify: FastifyInstance) {
    const authService = new AuthService();

    // POST /auth/signup
    fastify.post('/signup', {
        ...routeLimit('authSignup'),
        schema: signupSchema,
        handler: async (req, reply) => {
            const body = req.body as { offerIds?: string[] };
            const result = await authService.signup(req.body as any);

            // Claim the guest's offers. Identity comes from the signed cookie; the
            // client-supplied offerIds only narrow the set (ADR-001).
            if (req.guestId) {
                const migrated = await authService.migrateGuestOffers(
                    req.guestId,
                    result.user.id,
                    body.offerIds,
                );
                if (migrated > 0) {
                    req.log.info({ userId: result.user.id, migrated }, 'Migrated guest offers to new account');
                }
            }

            return reply.status(201).send({
                success: true,
                data: result,
            });
        },
    });

    // POST /auth/login
    // Brute-force protection: 10 attempts per 15 minutes. This limit has been defined in
    // RATE_LIMITS since the start and was never registered (C1).
    fastify.post('/login', {
        ...routeLimit('authLogin'),
        schema: loginSchema,
        handler: async (req, reply) => {
            const result = await authService.login(req.body as any);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });

    // POST /auth/google
    fastify.post('/google', {
        ...routeLimit('authLogin'),
        schema: googleAuthSchema,
        handler: async (req, reply) => {
            const body = req.body as { offerIds?: string[] };
            const result = await authService.googleAuth(req.body as any);

            if (req.guestId) {
                const migrated = await authService.migrateGuestOffers(
                    req.guestId,
                    result.user.id,
                    body.offerIds,
                );
                if (migrated > 0) {
                    req.log.info({ userId: result.user.id, migrated }, 'Migrated guest offers via Google auth');
                }
            }

            return reply.send({
                success: true,
                data: result,
            });
        },
    });

    // POST /auth/refresh
    fastify.post('/refresh', {
        schema: refreshTokenSchema,
        handler: async (req, reply) => {
            const { refreshToken } = req.body as any;
            const tokens = await authService.refreshAccessToken(refreshToken);

            return reply.send({
                success: true,
                data: { tokens },
            });
        },
    });

    // POST /auth/logout
    fastify.post('/logout', {
        schema: refreshTokenSchema,
        handler: async (req, reply) => {
            const { refreshToken } = req.body as any;
            await authService.logout(refreshToken);

            return reply.send({
                success: true,
                data: { message: 'Logged out successfully' },
            });
        },
    });
}
