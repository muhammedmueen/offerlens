import fp from 'fastify-plugin';
import multipart from '@fastify/multipart';
import { MAX_FILE_SIZE_BYTES } from '@/config/constants.js';
import type { FastifyPluginAsync } from 'fastify';

const multipartPlugin: FastifyPluginAsync = async (fastify) => {
    await fastify.register(multipart, {
        limits: {
            fileSize: MAX_FILE_SIZE_BYTES,
            files: 1, // Only 1 file per request allowed
        },
        attachFieldsToBody: true,
        sharedSchemaId: '#multipartFileType', // Optional, helps with types if generated
    });
};

export default fp(multipartPlugin, {
    name: 'multipart',
});
