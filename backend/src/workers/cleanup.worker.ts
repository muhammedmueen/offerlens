import { Worker } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { offerFiles } from '@/db/schema/offer-files.js';
import { lt, and, eq, inArray } from 'drizzle-orm';
import { LocalStorageProvider } from '@/providers/storage/local.storage.js';
import { UNFINISHED_STATUSES, stuckBefore, STUCK_FAILURE_REASON } from './reap.js';
import { quotaCounters } from '@/db/schema/quota-counters.js';
import { releaseOfferQuota } from '@/modules/quota/quota.service.js';
import { istDayWindow } from '@/shared/ist-day.js';
import { purgeFilesOfOffers } from './stored-file.js';

const storage = new LocalStorageProvider();

/**
 * Periodic maintenance. Both jobs are scheduled as BullMQ repeatable jobs in `index.ts`:
 * `cleanup-expired` hourly, `reap-stuck` every minute.
 */
export const cleanupWorker = new Worker(
    'maintenance-queue',
    async (job) => {
        if (job.name === 'reap-stuck') {
            const cutoff = stuckBefore(new Date());

            // One conditional UPDATE rather than read-then-write. A genuinely slow job can
            // finish between a read and a write, and re-checking the status inside the WHERE
            // clause means the reaper can never overwrite a COMPLETED verdict that landed a
            // moment earlier — the database decides, not a stale snapshot.
            const reaped = await db.update(offers)
                .set({ status: 'FAILED', failureReason: STUCK_FAILURE_REASON })
                .where(and(
                    inArray(offers.status, [...UNFINISHED_STATUSES]),
                    lt(offers.createdAt, cutoff),
                ))
                .returning({ id: offers.id });

            if (reaped.length > 0) {
                // Warn, not log: every row here is a user who watched a spinner and got
                // nothing. A run of these means the pipeline is dropping work.
                console.warn(
                    `[Reaper] Failed ${reaped.length} offer(s) unfinished since before `
                    + `${cutoff.toISOString()}: ${reaped.map((r) => r.id).join(', ')}`,
                );
            }

            // A reaped offer is a terminal failure, so it gets its analysis back (task 4.3).
            // This also covers BullMQ stalled-job failures, which never reach a processor
            // catch. Idempotent per offer, so a refund already made elsewhere is a no-op.
            for (const { id } of reaped) {
                try {
                    await db.transaction((tx) => releaseOfferQuota(tx, id));
                } catch (err) {
                    console.error(`[Reaper] Quota refund failed for offer ${id}:`, (err as Error)?.message);
                }
            }

            // A reaped offer never finished extraction, so its upload is still on disk (task 4.5).
            if (reaped.length > 0) await purgeFilesOfOffers(reaped.map((r) => r.id));
            return;
        }

        if (job.name === 'cleanup-expired') {
            console.log('[Cleanup] Starting cleanup of expired offers...');

            // Find expired offers
            const now = new Date();
            const expiredOffers = await db.query.offers.findMany({
                where: and(
                    lt(offers.expiresAt, now),
                    // Ensure we clean distinct ones or all?
                ),
                with: {
                    // We need file paths to delete
                    // But `offerFiles` is separate table.
                }
            });

            // We need to join manually or query files for these offers.
            // Deleting offer triggers CASCADE for files in DB, but we need to delete FROM DISK first.

            for (const offer of expiredOffers) {
                const files = await db.query.offerFiles.findMany({
                    where: eq(offerFiles.offerId, offer.id),
                });

                for (const file of files) {
                    try {
                        await storage.delete(file.storedPath);
                    } catch (e) {
                        console.error(`Failed to delete file ${file.storedPath}`, e);
                    }
                }

                // Delete offer (cascades to files/analyses)
                await db.delete(offers).where(eq(offers.id, offer.id));
            }

            console.log(`[Cleanup] Deleted ${expiredOffers.length} expired offers.`);

            // Quota counters are only read for today (IST). Keep two days of slack for a
            // refund that lands after midnight, and drop the rest.
            const keepFrom = istDayWindow(new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000)).day;
            const oldCounters = await db.delete(quotaCounters)
                .where(lt(quotaCounters.day, keepFrom))
                .returning({ day: quotaCounters.day });
            console.log(`[Cleanup] Deleted ${oldCounters.length} quota counter row(s) older than ${keepFrom}.`);
        }
    },
    defaultWorkerOptions
);
