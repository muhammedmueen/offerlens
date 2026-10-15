import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { createLoginGuard, routeLimit } from '@/middleware/rate-limiter.js';
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
    // Brute-force protection, three independent limits (see `createLoginGuard`): 10 per 15 min per
    // browser cookie (`authLogin`, below), 30 per 15 min per IP and 10 per 15 min per email.
    const loginGuard = createLoginGuard(fastify);
    fastify.post('/login', {
        ...routeLimit('authLogin'),
        preHandler: loginGuard.check,
        schema: loginSchema,
        handler: async (req, reply) => {
            const body = req.body as { email: string };
            const result = await authService.login(req.body as any);
            await loginGuard.clear(body.email); // reached only when the login succeeded

            return reply.send({
                success: true,
                data: result,
            });
        },
    });

    // POST /auth/google
    // Shares the per-cookie `authLogin` bucket only. It has no email in its body, so the per-email
    // and per-IP login limits do not apply here.
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
