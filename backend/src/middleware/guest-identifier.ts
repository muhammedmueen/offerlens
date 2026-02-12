import { FastifyRequest, FastifyReply } from 'fastify';
import { v4 as uuidv4 } from 'uuid';
import CryptoJS from 'crypto-js';
import { SPOOFING_THRESHOLD, SPOOFING_WINDOW_MS } from '@/config/constants.js';

declare module 'fastify' {
    interface FastifyRequest {
        guestId?: string;
    }
}

// In-memory spoofing tracker (IP -> { fingerprints: Set, since: timestamp })
// In production with multiple instances, this should be in Redis.
// For Phase 1 single instance, Map is fine.
const spoofingTracker = new Map<string, { fingerprints: Set<string>; since: number }>();

export const guestIdentifier = async (request: FastifyRequest, reply: FastifyReply) => {
    const ip = request.ip;
    const userAgent = request.headers['user-agent'] || 'unknown';
    const clientFingerprint = (request.headers['x-fingerprint'] as string) || '';

    // Simple server-side fingerprint fallback
    const fallbackFingerprint = CryptoJS.MD5(`${ip}-${userAgent}`).toString();

    const fingerprint = clientFingerprint || fallbackFingerprint;

    // Spoofing detection
    const now = Date.now();
    let tracker = spoofingTracker.get(ip);

    if (!tracker || now - tracker.since > SPOOFING_WINDOW_MS) {
        // Reset window
        tracker = { fingerprints: new Set(), since: now };
        spoofingTracker.set(ip, tracker);
    }

    tracker.fingerprints.add(fingerprint);

    if (tracker.fingerprints.size > SPOOFING_THRESHOLD) {
        request.log.warn({ ip, count: tracker.fingerprints.size }, 'Fingerprint spoofing detected');
        // Fallback to IP-based identity if spoofing detected
        request.guestId = `ip-${ip.replace(/[^a-zA-Z0-9]/g, '')}`;
    } else {
        // Trust the fingerprint
        request.guestId = fingerprint;
    }

    // Pass guestId to next handlers
};
