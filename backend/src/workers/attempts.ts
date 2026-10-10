/**
 * Whether the attempt currently running is the job's last.
 *
 * BullMQ increments `attemptsMade` AFTER a failure (bullmq job.js `moveToFailed`), so inside
 * the processor the running attempt is final iff `attemptsMade + 1 >= attempts`. Only a final
 * failure is terminal, and only a terminal failure refunds the analysis quota.
 *
 * Lives apart from the workers so it can be tested without constructing a BullMQ Worker.
 */
export function isFinalAttempt(job: { attemptsMade: number; opts: { attempts?: number } }): boolean {
    return job.attemptsMade + 1 >= (job.opts.attempts ?? 1);
}
