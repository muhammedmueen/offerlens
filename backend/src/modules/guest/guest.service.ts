import { db } from '@/db/index.js';
import { guests } from '@/db/schema/guests.js';
import { eq, sql } from 'drizzle-orm';
import { GuestIdentity, GuestLimits } from './guest.types.js';
import { RATE_LIMITS } from '@/config/constants.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export class GuestService {
    async getOrCreateGuest(identity: GuestIdentity) {
        // Try to find by fingerprint
        let guest = await db.query.guests.findFirst({
            where: eq(guests.fingerprint, identity.fingerprint),
        });

        if (!guest) {
            // Create new guest
            [guest] = await db.insert(guests).values({
                fingerprint: identity.fingerprint,
                ipAddress: identity.ip,
                dailyResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Next reset in 24h (approx, strict logic in cron)
                // Actually better to aligning reset to next midnight or rolling 24h?
                // Let's stick to rolling 24h from first seen or logic in middleware/cron.
                // For simplicity: set resetAt to tomorrow same time.
            }).returning();
        } else {
            // Update last seen
            await db.update(guests)
                .set({ lastSeen: new Date(), ipAddress: identity.ip })
                .where(eq(guests.id, guest.id));
        }

        return guest;
    }

    async checkLimits(guestId: string): Promise<void> {
        const guest = await db.query.guests.findFirst({
            where: eq(guests.id, guestId),
        });

        if (!guest) {
            throw new AppError(ERROR_CODES.NOT_FOUND, 'Guest not found', 404);
        }

        // Check if daily limit reset is needed (handled by cron or lazy check)
        // Here we do lazy check: if now > dailyResetAt, reset count
        if (new Date() > guest.dailyResetAt) {
            await db.update(guests).set({
                analysisCount: 0,
                dailyResetAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            }).where(eq(guests.id, guestId));
            guest.analysisCount = 0;
        }

        if (guest.analysisCount >= RATE_LIMITS.guestUpload.max) {
            throw new AppError(
                ERROR_CODES.GUEST_RESTRICTED,
                `Daily limit reached (${RATE_LIMITS.guestUpload.max} uploads/day). Resets at ${guest.dailyResetAt.toISOString()}`,
                429
            );
        }
    }

    async incrementAnalysisCount(guestId: string): Promise<void> {
        await db.update(guests)
            .set({ analysisCount: sql`${guests.analysisCount} + 1` })
            .where(eq(guests.id, guestId));
    }
}
