import { and, eq, inArray } from 'drizzle-orm';
import { db } from '@/db/index.js';
import { offerFiles } from '@/db/schema/offer-files.js';
import { LocalStorageProvider } from '@/providers/storage/local.storage.js';
import { isFinalAttempt } from './attempts.js';

const storage = new LocalStorageProvider();

/**
 * Remove an uploaded file from disk and mark its `offer_files` row. Never throws: by the time
 * this runs the text is already extracted (or the job is dead), and a cleanup problem must not
 * turn a finished job into a failed one. A file this misses is still removed when its offer is
 * deleted, or by the hourly expiry sweep for guests.
 */
export async function purgeStoredFile(storedPath: string): Promise<void> {
    try {
        await storage.delete(storedPath);
        await db.update(offerFiles)
            .set({ isDeleted: true, deletedAt: new Date() })
            .where(eq(offerFiles.storedPath, storedPath));
    } catch (err) {
        console.error(`[OCR] Could not purge stored file ${storedPath}:`, (err as Error)?.message);
    }
}

/**
 * Purge the still-undeleted uploads of offers the reaper just failed (task 4.5). Best-effort
 * like `purgeStoredFile`: the offers are already FAILED and the next sweep will not revisit
 * them, so a lookup error here must be logged and swallowed, never fail the reap job.
 */
export async function purgeFilesOfOffers(offerIds: string[]): Promise<void> {
    try {
        const stale = await db.query.offerFiles.findMany({
            where: and(inArray(offerFiles.offerId, offerIds), eq(offerFiles.isDeleted, false)),
        });
        for (const file of stale) await purgeStoredFile(file.storedPath);
    } catch (err) {
        console.error('[Reaper] Could not purge files of reaped offers:', (err as Error)?.message);
    }
}

/**
 * Run an OCR job, then delete its uploaded file (task 4.5): on success, on a terminal failure
 * the processor handles itself, and on the final failed attempt.
 *
 * NOT after an earlier failed attempt. BullMQ re-runs the job against the same `storedPath`, so
 * deleting there would turn every retry into a guaranteed "file not found". That is the one
 * place this deliberately does not delete.
 */
export async function runThenPurgeFile<T>(
    job: { attemptsMade: number; opts: { attempts?: number } },
    storedPath: string | undefined,
    run: () => Promise<T>,
    purge: (storedPath: string) => Promise<void> = purgeStoredFile,
): Promise<T> {
    let willRetry = false;
    try {
        return await run();
    } catch (err) {
        willRetry = !isFinalAttempt(job);
        throw err;
    } finally {
        if (storedPath && !willRetry) await purge(storedPath);
    }
}
