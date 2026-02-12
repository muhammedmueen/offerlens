import { FastifyInstance } from 'fastify';
import { AuthService } from './auth.service.js';
import { signupSchema, loginSchema, googleAuthSchema, refreshTokenSchema } from './auth.schema.js';

export async function authRoutes(fastify: FastifyInstance) {
    const authService = new AuthService();

    // POST /auth/signup
    fastify.post('/signup', {
        schema: signupSchema,
        handler: async (req, reply) => {
            const result = await authService.signup(req.body as any);

            // Migrate guest offers if fingerprint present
            if (req.guestId) {
                const migrated = await authService.migrateGuestOffers(req.guestId, result.user.id);
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
    fastify.post('/login', {
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
        schema: googleAuthSchema,
        handler: async (req, reply) => {
            const result = await authService.googleAuth(req.body as any);

            // Migrate guest offers if fingerprint present
            if (req.guestId) {
                const migrated = await authService.migrateGuestOffers(req.guestId, result.user.id);
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
