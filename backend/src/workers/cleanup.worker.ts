import { Worker } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { offerFiles } from '@/db/schema/offer-files.js';
import { lt, and, eq, isNotNull } from 'drizzle-orm';
import { LocalStorageProvider } from '@/providers/storage/local.storage.js';

const storage = new LocalStorageProvider();

// Cleanup isn't a BullMQ job usually, it's a cron.
// But we can use BullMQ repeatable jobs or just a simple setInterval if single instance.
// For robust setup, we use a worker that processes 'cleanup' jobs scheduled repeatedly.
// For Phase 1 simple: we'll just run this function or use a queue.
// Let's assume we have a 'system-queue' for maintenance.
// But wait, `cleanup.worker.ts` implies it runs logic.
// I'll make it a function that could be called by a cron, or a worker for a 'maintenance' queue.
// Let's use a Worker for 'maintenance-queue' with a repeatable job.

export const cleanupWorker = new Worker(
    'maintenance-queue',
    async (job) => {
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
        }
    },
    defaultWorkerOptions
);
