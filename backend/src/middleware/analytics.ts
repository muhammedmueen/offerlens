import { FastifyRequest, FastifyReply } from 'fastify';
import { analyticsEvents } from '@/db/schema/analytics.js';

type EventName =
    | 'offer.uploaded'
    | 'analysis.completed'
    | 'analysis.failed'
    | 'feature_request.created'
    | 'vote.cast'
    | 'guest.rate_limited';

// Helper to fire analytics events (fire-and-forget)
export const trackEvent = async (
    request: FastifyRequest,
    event: EventName,
    properties: Record<string, any> = {}
) => {
    try {
        const guestId = (request as any).guestId; // Not strictly UUID in guest-identifier yet, need to resolve guest table linkage
        // Actually, schema expects guestId to be UUID FK to guests table.
        // The guest-identifier middleware sets req.guestId as a string fingerprint basically.
        // Real linkage happens in the service layer where we look up the Guest UUID from the fingerprint.
        // For raw analytics, we might want to just store the fingerprint in properties or update schema to nullable UUID.
        // Checking schema: guestId is nullable UUID.

        // We can't insert a string fingerprint into a UUID column.
        // So for now, we'll store fingerprint in properties, and leave guestId null unless we have the real UUID.

        await request.server.db.insert(analyticsEvents).values({
            event,
            ipAddress: request.ip,
            properties: {
                ...properties,
                fingerprint: guestId, // Store fingerprint in JSONB
                userAgent: request.headers['user-agent'],
            },
        });

    } catch (err) {
        // Analytics should never crash the request
        request.log.error({ err, event }, 'Failed to track analytics event');
    }
};

// Middleware for specific routes if needed, but mostly used as a utility function
export const analyticsMiddleware = async (req: FastifyRequest, reply: FastifyReply) => {
    // Can be used to track page views or API hits globally
};
