import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';

const service = vi.hoisted(() => ({
    listPosts: vi.fn(async () => []),
    createPost: vi.fn(async (_userId: string, input: unknown) => ({ id: 'p1', ...(input as object) })),
    getPost: vi.fn(),
    createComment: vi.fn(async (_u: string, _p: string, content: string) => ({ id: 'c1', content })),
}));
vi.mock('./forum.service.js', () => ({
    ForumService: class { constructor() { return service; } },
}));
// Auth is not under test here: let every request through as a registered user.
vi.mock('@/middleware/authenticate.js', () => ({
    requireRegistered: async (req: { userId?: string }) => { req.userId = 'u1'; },
}));

const { forumRoutes } = await import('./forum.routes.js');

const POST_ID = '8b6f3c52-3a64-4b21-9d5e-0f5c1c2a7e11';

const build = async () => {
    const app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(forumRoutes, { prefix: '/forum' });
    await app.ready();
    return app;
};

beforeEach(() => vi.clearAllMocks());

describe('POST /forum/posts', () => {
    it('rejects the old `body` field and a missing content with 400, before touching the database', async () => {
        const app = await build();
        const res = await app.inject({
            method: 'POST', url: '/forum/posts',
            payload: { title: 'Offer help', body: 'text', category: 'advice' },
        });
        expect(res.statusCode).toBe(400);
        expect(service.createPost).not.toHaveBeenCalled();
    });

    it('rejects a category outside the fixed list', async () => {
        const app = await build();
        const res = await app.inject({
            method: 'POST', url: '/forum/posts',
            payload: { title: 'Offer help', content: 'text', category: 'memes' },
        });
        expect(res.statusCode).toBe(400);
    });

    it('defaults the category to general and passes trimmed content to the service', async () => {
        const app = await build();
        const res = await app.inject({
            method: 'POST', url: '/forum/posts',
            payload: { title: '  Offer help  ', content: '  hello  ' },
        });
        expect(res.statusCode).toBe(201);
        expect(service.createPost).toHaveBeenCalledWith('u1', { title: 'Offer help', content: 'hello', category: 'general' });
    });
});

describe('GET /forum/posts', () => {
    it('rejects an unknown category and passes a valid one through', async () => {
        const app = await build();
        expect((await app.inject({ method: 'GET', url: '/forum/posts?category=memes' })).statusCode).toBe(400);
        expect((await app.inject({ method: 'GET', url: '/forum/posts?category=career&page=2' })).statusCode).toBe(200);
        expect(service.listPosts).toHaveBeenCalledWith(2, 'career');
    });
});

describe('forum post and comment routes', () => {
    it('400s on a non-uuid post id instead of a database error', async () => {
        const app = await build();
        expect((await app.inject({ method: 'GET', url: '/forum/posts/not-a-uuid' })).statusCode).toBe(400);
        expect(service.getPost).not.toHaveBeenCalled();
    });

    it('comment requires `content`, and accepts it', async () => {
        const app = await build();
        const url = `/forum/posts/${POST_ID}/comments`;
        expect((await app.inject({ method: 'POST', url, payload: { body: 'hi' } })).statusCode).toBe(400);
        expect((await app.inject({ method: 'POST', url, payload: { content: 'hi' } })).statusCode).toBe(201);
        expect(service.createComment).toHaveBeenCalledWith('u1', POST_ID, 'hi');
    });
});
