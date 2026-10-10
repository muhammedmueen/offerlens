import { db } from '@/db/index.js';
import { guests } from '@/db/schema/guests.js';
import { eq } from 'drizzle-orm';
import { GuestIdentity } from './guest.types.js';

export class GuestService {
    /**
     * Resolve a guest cookie token to its row without creating one.
     *
     * `guests.fingerprint` holds the opaque token issued by the guest identity cookie
     * (ADR-001) — the column name predates the cookie scheme.
     */
    async findByToken(token: string) {
        return db.query.guests.findFirst({
            where: eq(guests.fingerprint, token),
        });
    }

    /**
     * Get or create the guest row for a cookie token, in ONE statement.
     *
     * Used to be find-then-insert, which races: a first visit that fires autofill and an
     * upload together could both miss and the second insert would hit the unique constraint.
     * The upsert also refreshes lastSeen/IP, which the old else-branch did separately.
     *
     * Daily limits no longer live on this row; they are in quota_counters (task 4.3).
     */
    async getOrCreateGuest(identity: GuestIdentity) {
        const [guest] = await db.insert(guests)
            .values({ fingerprint: identity.fingerprint, ipAddress: identity.ip })
            .onConflictDoUpdate({
                target: guests.fingerprint,
                set: { lastSeen: new Date(), ipAddress: identity.ip },
            })
            .returning();
        return guest;
    }
}
