import { db } from '@/db/index.js';
import { users } from '@/db/schema/users.js';
import { offers } from '@/db/schema/offers.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq, desc, count, avg } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

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

        const orderBy = opts.sort === 'score'
            ? desc(analyses.score)
            : desc(offers.createdAt);

        // Fetch offers with their analysis (if any)
        const userOffers = await db.select({
            id: offers.id,
            status: offers.status,
            rawText: offers.rawText,
            createdAt: offers.createdAt,
            userContext: offers.userContext,
            score: analyses.score,
            scoreLabel: analyses.scoreLabel,
        })
            .from(offers)
            .leftJoin(analyses, eq(offers.id, analyses.offerId))
            .where(eq(offers.userId, userId))
            .orderBy(orderBy)
            .limit(opts.limit)
            .offset(offset);

        const [totalResult] = await db.select({ total: count() })
            .from(offers)
            .where(eq(offers.userId, userId));

        return {
            offers: userOffers,
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

        const [avgScore] = await db.select({ avg: avg(analyses.score) })
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
            averageScore: avgScore.avg ? Math.round(Number(avgScore.avg)) : null,
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

    async deleteAccount(userId: string) {
        const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
        if (!user) throw new AppError(ERROR_CODES.NOT_FOUND, 'User not found', 404);

        // Cascading deletes handle offers, analyses, corrections, refresh tokens
        await db.delete(users).where(eq(users.id, userId));
    }
}
