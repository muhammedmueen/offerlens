import fp from 'fastify-plugin';
import { db, conn } from '@/db/index.js';
import type { FastifyPluginAsync } from 'fastify';

// Declare decoration types
declare module 'fastify' {
    interface FastifyInstance {
        db: typeof db;
    }
}

const databasePlugin: FastifyPluginAsync = async (fastify) => {
    // Decorate fastify instance with db
    fastify.decorate('db', db);

    // Close connection on shutdown
    fastify.addHook('onClose', async (instance) => {
        await conn.end();
        instance.log.info('Database connection closed');
    });
};

export default fp(databasePlugin, {
    name: 'db',
});
