import { FastifyInstance } from 'fastify';
import { GuestService } from '@/modules/guest/guest.service.js';
import { istDayWindow } from '@/shared/ist-day.js';
import { buildQuotaSnapshot, readCounts, tierForRequest, type QuotaSubject } from './quota.service.js';

/**
 * GET /quota — today's limits and usage for the caller (task 4.4). One route for registered
 * users and guests. Global rate limit only; the subject is the JWT user, else the guest cookie.
 *
 * READ-ONLY by design: a first-visit guest has no `guests` row yet and is answered with
 * used = 0 everywhere. This must never create the row (findByToken, not getOrCreateGuest).
 */
export async function quotaRoutes(fastify: FastifyInstance) {
    const guestService = new GuestService();

    fastify.get('/quota', async (req, reply) => {
        const tier = await tierForRequest(req);
        const window = istDayWindow(new Date());

        let subject: Pick<QuotaSubject, 'type' | 'id'> | null = null;
        if (req.userId) {
            subject = { type: 'user', id: req.userId };
        } else if (req.guestId) {
            const guest = await guestService.findByToken(req.guestId);
            if (guest) subject = { type: 'guest', id: guest.id };
        }

        const counts = subject ? await readCounts(subject, window.day) : {};

        return reply.send({
            success: true,
            data: buildQuotaSnapshot(tier, counts, window),
        });
    });
}
