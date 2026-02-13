import { FastifyInstance } from 'fastify';
import { UserService } from './user.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';

export async function userRoutes(fastify: FastifyInstance) {
    const userService = new UserService();

    // All routes here require authentication
    fastify.addHook('preHandler', requireRegistered);

    // GET /users/me — Get current user profile
    fastify.get('/me', async (req, reply) => {
        const user = await userService.getProfile(req.userId!);
        return reply.send({
            success: true,
            data: user,
        });
    });

    // GET /users/me/offers — Get offer history with pagination
    fastify.get('/me/offers', async (req, reply) => {
        const { page = '1', limit = '10', sort = 'date' } = req.query as { page?: string; limit?: string; sort?: string };
        const result = await userService.getOfferHistory(req.userId!, {
            page: Number(page),
            limit: Number(limit),
            sort,
        });

        return reply.send({
            success: true,
            data: result,
        });
    });

    // GET /users/me/dashboard — Get dashboard stats
    fastify.get('/me/dashboard', async (req, reply) => {
        const stats = await userService.getDashboardStats(req.userId!);
        return reply.send({
            success: true,
            data: stats,
        });
    });

    // DELETE /users/me — Delete account
    fastify.delete('/me', async (req, reply) => {
        await userService.deleteAccount(req.userId!);
        return reply.send({
            success: true,
            data: { message: 'Account deleted successfully' },
        });
    });
}
