import { db } from '@/db/index.js';
import { users } from '@/db/schema/users.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { corrections } from '@/db/schema/corrections.js';
import { forumPosts, forumComments } from '@/db/schema/forum.js';
import { usageLedger } from '@/db/schema/usage-ledger.js';
import { eq, desc, count, avg, max, sql, inArray } from 'drizzle-orm';
import { canAccessOffer } from '@/shared/access/offer-access.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

interface OfferListRow {
    extractedData: unknown;
    userContext: unknown;
    [key: string]: unknown;
}

/**
 * One dashboard/compare row. The list carries just the company and role the analysis found
 * (falling back to the role the user typed at upload), never the whole extractedData blob.
 */
export function toOfferListItem<T extends OfferListRow>(row: T) {
    const { extractedData, ...rest } = row;
    const extracted = extractedData as { companyName?: string | null; role?: string | null } | null;
    const context = row.userContext as { role?: string | null } | null;
    return {
        ...rest,
        company: extracted?.companyName || null,
        role: extracted?.role || context?.role || null,
    };
}

export class UserService {
    async getProfile(userId: string) {
        const user = await db.query.users.findFirst({
            where: eq(users.id, userId),
        });

        if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

        return {
            id: user.id,
            email: user.email,
            name: user.name,
            avatarUrl: user.avatarUrl,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
        };
    }

    async getOfferHistory(userId: string, opts: { page: number; limit: number; sort: string }) {
        const offset = (opts.page - 1) * opts.limit;

        // NULLS LAST: an offer with no analysis yet has no score and must not lead a score sort
        // (Postgres puts NULLs first on DESC). offers.id breaks ties so OFFSET paging never
        // repeats or skips a row.
        const orderBy = opts.sort === 'score'
            ? [sql`${analyses.score} DESC NULLS LAST`, desc(offers.createdAt), desc(offers.id)]
            : [desc(offers.createdAt), desc(offers.id)];

        // Fetch offers with their analysis (if any)
        const userOffers = await db.select({
            id: offers.id,
            status: offers.status,
            createdAt: offers.createdAt,
            userContext: offers.userContext,
            score: analyses.score,
            scoreLabel: analyses.scoreLabel,
            extractedData: analyses.extractedData,
        })
            .from(offers)
            .leftJoin(analyses, eq(offers.id, analyses.offerId))
            .where(eq(offers.userId, userId))
            .orderBy(...orderBy)
            .limit(opts.limit)
            .offset(offset);

        const [totalResult] = await db.select({ total: count() })
            .from(offers)
            .where(eq(offers.userId, userId));

        return {
            offers: userOffers.map(toOfferListItem),
            pagination: {
                page: opts.page,
                limit: opts.limit,
                total: totalResult.total,
                totalPages: Math.ceil(totalResult.total / opts.limit),
            },
        };
    }

    async getDashboardStats(userId: string) {
        const [offerCount] = await db.select({ total: count() })
            .from(offers)
            .where(eq(offers.userId, userId));

        const [scoreStats] = await db.select({ avg: avg(analyses.score), best: max(analyses.score) })
            .from(analyses)
            .innerJoin(offers, eq(analyses.offerId, offers.id))
            .where(eq(offers.userId, userId));

        // Score distribution
        const completedOffers = await db.select({
            score: analyses.score,
            scoreLabel: analyses.scoreLabel,
        })
            .from(analyses)
            .innerJoin(offers, eq(analyses.offerId, offers.id))
            .where(eq(offers.userId, userId));

        return {
            totalOffers: offerCount.total,
            averageScore: scoreStats.avg ? Math.round(Number(scoreStats.avg)) : null,
            bestScore: scoreStats.best ?? null,
            completedAnalyses: completedOffers.length,
            scoreDistribution: {
                excellent: completedOffers.filter(o => o.scoreLabel === 'excellent').length,
                good: completedOffers.filter(o => o.scoreLabel === 'good').length,
                fair: completedOffers.filter(o => o.scoreLabel === 'fair').length,
                weak: completedOffers.filter(o => o.scoreLabel === 'weak').length,
                poor: completedOffers.filter(o => o.scoreLabel === 'poor').length,
            },
        };
    }

    /**
     * Everything stored against this account (task 4.7). Scoped strictly to `userId`: each query
     * filters on it, and the rows are filtered again in code (`canAccessOffer` for offers) so a
     * query that ever widened would still not leak another user's data.
     *
     * Left out on purpose: the password hash, Google id and refresh tokens (credentials, not the
     * user's data); salary submissions (anonymous since 4.6, nothing links them to an account);
     * unclaimed guest offers (they belong to a browser cookie, not this account).
     *
     * ponytail: one unpaged read per table. Offers are capped at 3 analyses a day, so this is
     * small; the ledger is the one that grows. Stream or page it if an export ever gets large.
     */
    async exportAccount(userId: string) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

        const ownOffers = (await db.select().from(offers).where(eq(offers.userId, userId)))
            .filter((o) => canAccessOffer(o, { userId }));
        const offerIds = new Set(ownOffers.map((o) => o.id));

        const [offerAnalyses, ownCorrections, posts, comments, ledger] = await Promise.all([
            db.select().from(analyses).where(inArray(analyses.offerId, [...offerIds])),
            db.select().from(corrections).where(eq(corrections.userId, userId)),
            db.select().from(forumPosts).where(eq(forumPosts.userId, userId)),
            db.select().from(forumComments).where(eq(forumComments.userId, userId)),
            db.select().from(usageLedger).where(eq(usageLedger.userId, userId)),
        ]);

        return {
            exportedAt: new Date().toISOString(),
            profile: {
                id: user.id,
                email: user.email,
                name: user.name,
                avatarUrl: user.avatarUrl,
                isEmailVerified: user.isEmailVerified,
                plan: user.plan,
                createdAt: user.createdAt,
            },
            offers: ownOffers.map((o) => ({
                id: o.id,
                status: o.status,
                rawText: o.rawText,
                userContext: o.userContext,
                failureReason: o.failureReason,
                createdAt: o.createdAt,
                analysis: offerAnalyses.find((a) => a.offerId === o.id) ?? null,
            })),
            corrections: ownCorrections.filter((c) => c.userId === userId && offerIds.has(c.offerId)),
            forumPosts: posts.filter((p) => p.userId === userId),
            forumComments: comments.filter((c) => c.userId === userId),
            aiUsage: ledger.filter((r) => r.userId === userId),
        };
    }

    async deleteAccount(userId: string) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

        // Cascading deletes handle offers, analyses, corrections, refresh tokens
        await db.delete(users).where(eq(users.id, userId));
    }
}
