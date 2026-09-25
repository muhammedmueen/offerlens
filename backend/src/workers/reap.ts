import { STUCK_OFFER_TIMEOUT_MS } from '@/config/constants.js';

/**
 * Stuck-offer reaper predicate (plan task 21a).
 *
 * The OCR worker moves an offer to PROCESSING; the analysis worker moves it to COMPLETED or
 * FAILED. Nothing writes a terminal status if the worker dies in between. BullMQ moves the
 * *job* to failed once `maxStalledCount` is exceeded, but it knows nothing about the `offers`
 * table, so the row stays PROCESSING and the frontend polls it forever. Observed repeatedly
 * in development whenever `tsx watch` restarted mid-analysis, and there is no reason a
 * deploy, an OOM kill or a lost Redis connection would behave differently in production.
 *
 * QUEUED is reaped on the same terms. An offer sits QUEUED when no worker ever picked the job
 * up at all — the workers process not running, or Redis unreachable at enqueue time — which
 * from the user's side is the same dead end.
 *
 * ── WHY createdAt, NOT updatedAt ──────────────────────────────────────────────
 * `offers.updatedAt` is `defaultNow()` with no `$onUpdate`, no database trigger, and no
 * writer that sets it explicitly, so it is frozen at insert time. Keying the reaper off it
 * would appear to work purely by accident. `createdAt` states the condition we actually mean:
 * this offer was accepted N minutes ago and still has no verdict.
 *
 * ── WHY THE PREDICATE LIVES HERE ──────────────────────────────────────────────
 * Separated from `cleanup.worker.ts` only so it can be imported without constructing a
 * BullMQ `Worker`, which would open a Redis connection at module load. There is exactly one
 * definition of "reapable" and the query uses these values directly, so the test and the
 * SQL cannot drift apart.
 */

/**
 * Statuses that mean "the pipeline still owes this offer an answer".
 *
 * COMPLETED and FAILED are terminal and must never appear here: re-failing a finished offer
 * would destroy a real analysis the user can already see.
 */
export const UNFINISHED_STATUSES = ['QUEUED', 'PROCESSING'] as const;

/** Offers created before this instant, and still unfinished, are considered dead. */
export function stuckBefore(now: Date, timeoutMs: number = STUCK_OFFER_TIMEOUT_MS): Date {
    return new Date(now.getTime() - timeoutMs);
}

/**
 * Written to `offers.failureReason` and shown to the user verbatim.
 *
 * No `CODE:` prefix on purpose. `ProcessingPage.getErrorMessage` strips the three prefixes it
 * knows (`RATE_LIMIT:`, `INVALID_REQUEST:`, `AI_ERROR:`) and otherwise prints the string
 * as-is, so inventing a fourth tag here would put `TIMED_OUT:` on screen. A plain sentence
 * needs no frontend change to read correctly.
 */
export const STUCK_FAILURE_REASON =
    'This analysis stopped responding and was cancelled. Please upload the offer again.';
