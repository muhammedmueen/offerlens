import { FastifyRequest, FastifyReply } from 'fastify';

export const requestLogger = async (request: FastifyRequest, reply: FastifyReply) => {
    const start = Date.now();

    reply.header('X-Request-Id', request.id);

    // Hook into onResponse to log completion
    reply.raw.on('finish', () => {
        const duration = Date.now() - start;
        const logLevel = reply.statusCode >= 500 ? 'error' : reply.statusCode >= 400 ? 'warn' : 'info';

        request.log[logLevel]({
            method: request.method,
            url: request.url,
            status: reply.statusCode,
            durationMs: duration,
            guestId: request.guestId,
            ip: request.ip,
        }, 'Request completed');
    });
};
