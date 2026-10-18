import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getTableColumns } from 'drizzle-orm';

/**
 * Response-shape half of the frontend↔backend contract (app.contract.test.ts covers the paths).
 *
 * The Forum, Feature Requests and Dashboard pages all shipped reading fields the API never sent
 * (`body`, `votes`, `avgScore`, `totalPages`…) and nothing failed, because the pages read the
 * payload through `any` and the route test only checked that routes exist.
 *
 * Each list below is what frontend/src/types/api.ts declares for that endpoint, kept as a literal
 * so a change on either side has to be made on purpose. The real services run against a recorder
 * in place of the database, and the rows it hands back are generated from the select fields / table
 * columns the service actually asked for. So removing or renaming a column in a query fails here;
 * a hand-written fixture would keep passing.
 */

const h = vi.hoisted(() => ({
    selects: [] as Array<(fields?: Record<string, unknown>) => unknown[]>,
    findMany: null as null | ((opts?: { columns?: Record<string, boolean> }) => unknown[]),
    insertRow: null as unknown,
}));

vi.mock('@/db/index.js', () => {
    const thenable = (resolve: (rows: unknown) => void, value: unknown) => resolve(value);
    const selectChain = (fields?: Record<string, unknown>) => {
        const chain: Record<string, unknown> = {};
        for (const m of ['from', 'leftJoin', 'innerJoin', 'where', 'orderBy', 'limit', 'offset']) chain[m] = () => chain;
        chain.then = (resolve: (rows: unknown) => void) => thenable(resolve, h.selects.shift()!(fields));
        return chain;
    };
    const updateChain: Record<string, unknown> = {};
    for (const m of ['set', 'where']) updateChain[m] = () => updateChain;
    updateChain.then = (resolve: (v: unknown) => void) => resolve(undefined);
    return {
        db: {
            select: (fields?: Record<string, unknown>) => selectChain(fields),
            update: () => updateChain,
            insert: () => ({
                values: () => ({
                    // Like drizzle: a field map returns just those columns, none returns the whole row.
                    returning: async (fields?: Record<string, unknown>) => [fields ? rowFrom(Object.keys(fields)) : h.insertRow],
                }),
            }),
            query: {
                users: { findFirst: async () => ({ id: 'u1', name: 'Asha', avatarUrl: null }) },
                featureRequests: { findMany: async (opts?: { columns?: Record<string, boolean> }) => h.findMany!(opts) },
            },
        },
    };
});

const { forumPosts } = await import('@/db/schema/forum.js');
const { featureRequests } = await import('@/db/schema/feature-requests.js');
const { ForumService } = await import('@/modules/forum/forum.service.js');
const { FeatureRequestService } = await import('@/modules/feature-request/feature-request.service.js');
const { UserService } = await import('@/modules/user/user.service.js');

// ---- what the frontend reads (mirror of frontend/src/types/api.ts) ----
const FORUM_LIST_ITEM = ['id', 'title', 'category', 'createdAt', 'authorName', 'commentCount'];
const FORUM_POST_DETAIL = ['id', 'title', 'content', 'category', 'createdAt', 'author', 'comments'];
const FORUM_COMMENT = ['id', 'content', 'createdAt', 'authorName'];
const FEATURE_REQUEST = ['id', 'title', 'description', 'status', 'voteCount', 'hasVoted', 'createdAt'];
const OFFER_LIST_ITEM = ['id', 'status', 'createdAt', 'score', 'scoreLabel', 'company', 'role'];
const DASHBOARD_STATS = ['totalOffers', 'completedAnalyses', 'averageScore', 'bestScore'];
// Internal identifiers of the person who submitted a request. Public endpoint: never returned.
const PRIVATE_FEATURE_REQUEST_FIELDS = ['submittedByFingerprint', 'submittedByIp'];

const sample = (key: string): unknown => {
    if (key === 'extractedData') return { companyName: 'Acme', role: 'Engineer' };
    if (key === 'userContext') return {};
    if (['total', 'avg', 'best', 'score', 'commentCount'].includes(key)) return 50;
    return key.endsWith('At') ? new Date() : 'x';
};
const rowFrom = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, sample(k)]));
const fieldsRow = (fields?: Record<string, unknown>) => [rowFrom(Object.keys(fields ?? {}))];

const hasKeys = (obj: object, keys: string[]) =>
    expect(Object.keys(obj), `response is missing a field the frontend reads`).toEqual(expect.arrayContaining(keys));

beforeEach(() => { h.selects = []; h.findMany = null; h.insertRow = null; });

describe('forum responses', () => {
    it('post list items carry the fields ForumPage reads', async () => {
        h.selects = [fieldsRow];
        const [item] = await new ForumService().listPosts(1);
        hasKeys(item, FORUM_LIST_ITEM);
    });

    it('post detail and its comments carry the fields ForumPostPage reads', async () => {
        h.selects = [() => [rowFrom(Object.keys(getTableColumns(forumPosts)))], fieldsRow];
        const post = await new ForumService().getPost('p1');
        hasKeys(post, FORUM_POST_DETAIL);
        hasKeys(post.comments[0], FORUM_COMMENT);
    });
});

describe('feature request responses', () => {
    const allColumns = () => Object.keys(getTableColumns(featureRequests));
    // Honour `columns: { x: false }` exclusions the way drizzle does, so a fix is actually tested.
    const findMany = (opts?: { columns?: Record<string, boolean> }) => {
        const excluded = Object.entries(opts?.columns ?? {}).filter(([, v]) => v === false).map(([k]) => k);
        return [rowFrom(allColumns().filter((k) => !excluded.includes(k)))];
    };

    it('list items carry the fields FeatureRequestsPage reads', async () => {
        h.findMany = findMany;
        h.selects = [() => [{ value: 1 }]];
        const { data } = await new FeatureRequestService().getList({ sort: 'votes', page: 1, pageSize: 20 });
        hasKeys(data[0], FEATURE_REQUEST);
    });

    it('list items do not expose who submitted them', async () => {
        h.findMany = findMany;
        h.selects = [() => [{ value: 1 }]];
        const { data } = await new FeatureRequestService().getList({ sort: 'votes', page: 1, pageSize: 20 });
        for (const field of PRIVATE_FEATURE_REQUEST_FIELDS) expect(data[0]).not.toHaveProperty(field);
    });

    it('a newly created request does not echo the submitter fingerprint or IP either', async () => {
                const created = await new FeatureRequestService().create('Dark mode', 'A long enough description.', 'fp', '1.2.3.4');
        hasKeys(created, ['id', 'title', 'description', 'status', 'voteCount', 'createdAt']);
        for (const field of PRIVATE_FEATURE_REQUEST_FIELDS) expect(created).not.toHaveProperty(field);
    });
});

describe('user responses', () => {
    it('offer history items and pagination carry the fields DashboardPage and ComparePage read', async () => {
        h.selects = [fieldsRow, fieldsRow];
        const res = await new UserService().getOfferHistory('u1', { page: 1, limit: 20, sort: 'createdAt' });
        hasKeys(res.offers[0], OFFER_LIST_ITEM);
        hasKeys(res.pagination, ['totalPages']);
    });

    it('dashboard stats carry the fields the stat tiles read', async () => {
        h.selects = [fieldsRow, fieldsRow, fieldsRow];
        const stats = await new UserService().getDashboardStats('u1');
        hasKeys(stats, DASHBOARD_STATS);
    });
});
