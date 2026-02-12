import { db } from '@/db/index.js';
import { featureRequests, featureRequestVotes } from '@/db/schema/feature-requests.js';
import { eq, sql, and, desc, asc, count, inArray } from 'drizzle-orm';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

export interface ListFeatureRequestsOptions {
    sort: 'votes' | 'newest' | 'oldest';
    status?: 'open' | 'planned' | 'in_progress' | 'done' | 'rejected';
    page: number;
    pageSize: number;
    fingerprint?: string;
}

export class FeatureRequestService {
    async create(title: string, description: string, fingerprint: string, ip: string) {
        const [request] = await db.insert(featureRequests).values({
            title,
            description,
            submittedByFingerprint: fingerprint,
            submittedByIp: ip,
        }).returning();

        return request;
    }

    async getList(options: ListFeatureRequestsOptions) {
        const { sort, status, page, pageSize, fingerprint } = options;
        const offset = (page - 1) * pageSize;

        // Build where conditions
        const conditions = status ? eq(featureRequests.status, status) : undefined;

        // Build order by
        const orderBy = sort === 'newest'
            ? [desc(featureRequests.createdAt)]
            : sort === 'oldest'
                ? [asc(featureRequests.createdAt)]
                : [desc(featureRequests.voteCount)]; // default: votes

        // Query data
        const data = await db.query.featureRequests.findMany({
            where: conditions,
            orderBy: () => orderBy,
            limit: pageSize,
            offset,
        });

        // Count total
        const [totalResult] = await db
            .select({ value: count() })
            .from(featureRequests)
            .where(conditions);
        const total = totalResult?.value ?? 0;

        // Check hasVoted for each item if fingerprint provided
        let votedIds: Set<string> = new Set();
        if (fingerprint && data.length > 0) {
            const ids = data.map(d => d.id);
            const votes = await db.query.featureRequestVotes.findMany({
                where: and(
                    inArray(featureRequestVotes.featureRequestId, ids),
                    eq(featureRequestVotes.fingerprint, fingerprint)
                ),
                columns: { featureRequestId: true },
            });
            votedIds = new Set(votes.map(v => v.featureRequestId));
        }

        const items = data.map(item => ({
            ...item,
            hasVoted: votedIds.has(item.id),
        }));

        return {
            data: items,
            meta: { page, pageSize, total },
        };
    }

    async vote(requestId: string, fingerprint: string, ip: string) {
        // Check if feature request exists
        const request = await db.query.featureRequests.findFirst({
            where: eq(featureRequests.id, requestId),
        });

        if (!request) {
            throw new AppError(ERROR_CODES.NOT_FOUND, 'Feature request not found', 404);
        }

        // Check if already voted
        const existingVote = await db.query.featureRequestVotes.findFirst({
            where: and(
                eq(featureRequestVotes.featureRequestId, requestId),
                eq(featureRequestVotes.fingerprint, fingerprint)
            ),
        });

        if (existingVote) {
            throw new AppError(ERROR_CODES.ALREADY_VOTED, 'You have already voted for this feature.', 409);
        }

        await db.transaction(async (tx) => {
            await tx.insert(featureRequestVotes).values({
                featureRequestId: requestId,
                fingerprint,
                ipAddress: ip,
            });

            await tx.update(featureRequests)
                .set({ voteCount: sql`${featureRequests.voteCount} + 1` })
                .where(eq(featureRequests.id, requestId));
        });

        // Return updated vote count
        const updated = await db.query.featureRequests.findFirst({
            where: eq(featureRequests.id, requestId),
            columns: { voteCount: true },
        });

        return {
            featureRequestId: requestId,
            voteCount: updated?.voteCount ?? request.voteCount + 1,
            voted: true,
        };
    }
}
