import { and, eq, gt, isNotNull, sql } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { db } from '@/db/index.js';
import { quotaCounters } from '@/db/schema/quota-counters.js';
import { offers } from '@/db/schema/offers.js';
import { users } from '@/db/schema/users.js';
import { GUEST, PLANS, QUOTA_FEATURES, planFor, type QuotaFeature, type Tier, type TierId } from '@/config/plans.js';
import { istDayWindow, type IstDayWindow } from '@/shared/ist-day.js';
import { QuotaExceededError } from '@/shared/errors/app-error.js';

/**
 * Daily quotas (tasks 4.3/4.4): ONE mechanism for guest and registered analyses and for the
 * career / negotiation / autofill caps.
 *
 * Deliberately imports no BullMQ or queue module, so workers and the Postgres test can use it
 * without a Redis connection.
 */

declare module 'fastify' {
    interface FastifyRequest {
        /** Memoised by `tierForRequest`: one plan lookup per request. */
        tier?: Tier;
    }
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
/** `db` itself or a transaction handle. */
export type Executor = typeof db | Tx;

export type SubjectType = 'user' | 'guest';

export interface QuotaSubject {
    type: SubjectType;
    id: string;
    tier: Tier;
}

/** A slot that was taken, with the day it was taken on so a release goes back to that day. */
export interface Reservation {
    subjectType: SubjectType;
    subjectId: string;
    feature: QuotaFeature;
    day: string;
    count: number;
}

/**
 * The quota subject for a caller. A registered user is ALWAYS the `user` subject and never
 * touches their browser's guest counters.
 */
export function subjectFor(userId: string | null | undefined, guestRowId: string | null | undefined, tier: Tier): QuotaSubject | null {
    if (userId) return { type: 'user', id: userId, tier };
    if (guestRowId) return { type: 'guest', id: guestRowId, tier };
    return null;
}

/**
 * The reservation statement. Atomic under concurrency: the upsert takes the row lock, and
 * Postgres re-evaluates the DO UPDATE ... WHERE against the latest committed count, so N
 * concurrent callers can never push `count` past `limit`. No row back means over quota.
 */
export function reserveStatement(executor: Executor, subject: QuotaSubject, feature: QuotaFeature, day: string, limit: number) {
    return executor.insert(quotaCounters)
        .values({ subjectType: subject.type, subjectId: subject.id, feature, day, count: 1, updatedAt: new Date() })
        .onConflictDoUpdate({
            target: [quotaCounters.subjectType, quotaCounters.subjectId, quotaCounters.feature, quotaCounters.day],
            set: { count: sql`${quotaCounters.count} + 1`, updatedAt: new Date() },
            setWhere: sql`${quotaCounters.count} < ${limit}`,
        })
        .returning({ count: quotaCounters.count });
}

/** Give one slot back. Never drives the counter below zero. */
export function releaseStatement(executor: Executor, r: Pick<Reservation, 'subjectType' | 'subjectId' | 'feature' | 'day'>) {
    return executor.update(quotaCounters)
        .set({ count: sql`${quotaCounters.count} - 1`, updatedAt: new Date() })
        .where(and(
            eq(quotaCounters.subjectType, r.subjectType),
            eq(quotaCounters.subjectId, r.subjectId),
            eq(quotaCounters.feature, r.feature),
            eq(quotaCounters.day, r.day),
            gt(quotaCounters.count, 0),
        ));
}

/**
 * Claim an offer's refund. Only the first caller gets a row back: after the row lock,
 * concurrent or repeated callers see quota_refunded = true and match nothing.
 */
export function claimRefundStatement(executor: Executor, offerId: string) {
    return executor.update(offers)
        .set({ quotaRefunded: true })
        .where(and(
            eq(offers.id, offerId),
            isNotNull(offers.quotaDay),
            eq(offers.quotaRefunded, false),
        ))
        .returning({
            subjectType: offers.quotaSubjectType,
            subjectId: offers.quotaSubjectId,
            day: offers.quotaDay,
        });
}

/**
 * Take one unit of `feature` for today (IST). Returns null when the tier is unlimited (nothing
 * to give back later); throws `QuotaExceededError` when the day's allowance is used up.
 */
export async function reserve(executor: Executor, subject: QuotaSubject, feature: QuotaFeature, now: Date = new Date()): Promise<Reservation | null> {
    const limit = subject.tier.daily[feature];
    if (limit === null) return null;

    const { day, resetAt } = istDayWindow(now);
    // `used = limit`: the WHERE failed, so count >= limit. Informational; no extra query.
    const exceeded = () => new QuotaExceededError({ feature, limit, used: limit, tierId: subject.tier.id, resetAt, now });

    // The fresh-insert branch of the upsert would allow 1 even at limit 0.
    if (limit <= 0) throw exceeded();

    const rows = await reserveStatement(executor, subject, feature, day, limit);
    if (rows.length === 0) throw exceeded();

    return { subjectType: subject.type, subjectId: subject.id, feature, day, count: rows[0].count };
}

/** Give a reservation back. No-op for null (unlimited). */
export async function release(executor: Executor, r: Reservation | null): Promise<void> {
    if (!r) return;
    await releaseStatement(executor, r);
}

/**
 * Refund an offer's analysis reservation, at most once, to the day it was charged.
 * Returns whether this call did the refund. Run it inside a transaction so the claim and the
 * decrement commit together.
 */
export async function releaseOfferQuota(executor: Executor, offerId: string): Promise<boolean> {
    const [claimed] = await claimRefundStatement(executor, offerId);
    if (!claimed || !claimed.subjectType || !claimed.subjectId || !claimed.day) return false;
    await releaseStatement(executor, {
        subjectType: claimed.subjectType,
        subjectId: claimed.subjectId,
        feature: 'analysis',
        day: claimed.day,
    });
    return true;
}

/** Terminal failure: mark the offer FAILED and refund its analysis, in one transaction. */
export async function failOfferAndRefund(offerId: string, reason: string): Promise<void> {
    await db.transaction(async (tx) => {
        await tx.update(offers)
            .set({ status: 'FAILED', failureReason: reason })
            .where(eq(offers.id, offerId));
        await releaseOfferQuota(tx, offerId);
    });
}

/**
 * The caller's tier: their plan when signed in, GUEST otherwise. Memoised on the request so
 * the feature guard, the caps and model gating share one lookup. No cache across requests, so
 * a plan change takes effect on the next one.
 */
export async function tierForRequest(req: Pick<FastifyRequest, 'userId' | 'tier'>): Promise<Tier> {
    if (req.tier) return req.tier;
    let tier: Tier = GUEST;
    if (req.userId) {
        const [row] = await db.select({ plan: users.plan }).from(users).where(eq(users.id, req.userId)).limit(1);
        tier = planFor(row?.plan);
    }
    req.tier = tier;
    return tier;
}

/** Today's counts for a subject, by feature. Missing features were not used. */
export async function readCounts(subject: Pick<QuotaSubject, 'type' | 'id'>, day: string): Promise<Partial<Record<QuotaFeature, number>>> {
    const rows = await db.select({ feature: quotaCounters.feature, count: quotaCounters.count })
        .from(quotaCounters)
        .where(and(
            eq(quotaCounters.subjectType, subject.type),
            eq(quotaCounters.subjectId, subject.id),
            eq(quotaCounters.day, day),
        ));
    return Object.fromEntries(rows.map((r) => [r.feature, r.count]));
}

export interface QuotaLine {
    limit: number | null;
    used: number;
    remaining: number | null;
}

export interface QuotaSnapshot {
    plan: TierId;
    day: string;
    resetAt: string;
    quotas: Record<QuotaFeature, QuotaLine>;
    /** What a free account gets, so the guest copy needs no hard-coded number. */
    accountAnalysesPerDay: number;
}

/** The GET /quota body. Pure. `null` limit/remaining means unlimited. */
export function buildQuotaSnapshot(tier: Tier, counts: Partial<Record<QuotaFeature, number>>, window: IstDayWindow): QuotaSnapshot {
    const quotas = Object.fromEntries(QUOTA_FEATURES.map((feature) => {
        const limit = tier.daily[feature];
        const used = counts[feature] ?? 0;
        return [feature, { limit, used, remaining: limit === null ? null : Math.max(0, limit - used) }];
    })) as Record<QuotaFeature, QuotaLine>;

    return {
        plan: tier.id,
        day: window.day,
        resetAt: window.resetAt.toISOString(),
        quotas,
        accountAnalysesPerDay: PLANS.free.daily.analysis ?? 0,
    };
}
