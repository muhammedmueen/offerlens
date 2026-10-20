import { FastifyInstance } from 'fastify';
import { ForumService } from './forum.service.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { listPostsSchema, createPostSchema, getPostSchema, createCommentSchema } from './forum.schema.js';

export async function forumRoutes(fastify: FastifyInstance) {
    const forumService = new ForumService();

    // GET /forum/posts — List posts (with optional category filter)
    fastify.get('/posts', {
        schema: listPostsSchema,
        handler: async (req, reply) => {
            const { page, category } = req.query as { page: number; category?: string };
            const posts = await forumService.listPosts(page, category);

            return reply.send({
                success: true,
                data: posts,
            });
        },
    });

    // POST /forum/posts — Create a post (registered users only)
    fastify.post('/posts', {
        schema: createPostSchema,
        preHandler: [requireRegistered],
        handler: async (req, reply) => {
            const body = req.body as { title: string; content: string; category: string };
            const post = await forumService.createPost(req.userId!, body);

            return reply.status(201).send({
                success: true,
                data: post,
            });
        },
    });

    // GET /forum/posts/:postId — Get a single post with comments
    fastify.get('/posts/:postId', {
        schema: getPostSchema,
        handler: async (req, reply) => {
            const { postId } = req.params as { postId: string };
            const post = await forumService.getPost(postId);

            return reply.send({
                success: true,
                data: post,
            });
        },
    });

    // POST /forum/posts/:postId/comments — Add a comment (registered users only)
    fastify.post('/posts/:postId/comments', {
        schema: createCommentSchema,
        preHandler: [requireRegistered],
        handler: async (req, reply) => {
            const { postId } = req.params as { postId: string };
            const { content } = req.body as { content: string };
            const comment = await forumService.createComment(req.userId!, postId, content);

            return reply.status(201).send({
                success: true,
                data: comment,
            });
        },
    });
}
