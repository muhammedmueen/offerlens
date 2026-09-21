import { Redis } from 'ioredis';
import { config } from '@/config/index.js';

/**
 * Process-wide Redis client and fail-soft cache helpers.
 *
 * ── WHY THIS EXISTS SEPARATELY FROM THE FASTIFY PLUGIN ───────────────────────
 * Redis was only reachable as `fastify.redis`, which meant anything outside a request could
 * not use it. `SalaryService` is constructed BOTH in routes and in the analysis worker
 * (`new SalaryService()`), and the worker has no Fastify instance — so a cache hanging off the
 * plugin would have been a cache that worked on one of the two call paths.
 *
 * One client per process: the plugin now decorates with this one rather than creating a second,
 * so rate limiting and caching share a connection.
 *
 * ── EVERY OPERATION FAILS SOFT ───────────────────────────────────────────────
 * A cache is an optimisation. If Redis is unreachable, slow, or returns something unparseable,
 * the correct behaviour is to miss and let the caller hit the database — never to fail the
 * request. So every helper swallows its errors and returns `null`, logging once rather than per
 * call so a Redis outage does not also become a log flood.
 */

let client: Redis | null = null;

/**
 * The shared client, created on first use.
 *
 * `lazyConnect` is kept so the Fastify plugin can connect explicitly at boot and fail fast when
 * Redis is down. Outside Fastify — in the worker — ioredis establishes the connection on the
 * first command, so callers need no setup.
 */
export function getRedis(): Redis {
    if (!client) {
        client = new Redis(config.REDIS_URL, {
            lazyConnect: true,
            // Cache reads must not hang a request behind a dead Redis. After this many failed
            // retries ioredis errors immediately instead of queueing, and the helpers below turn
            // that into a cache miss.
            maxRetriesPerRequest: 2,
        });

        client.on('error', (err) => {
            // ioredis emits on every reconnect attempt; without a handler these become unhandled
            // error events and take the process down. Rate-limited so an outage is not a flood.
            reportOnce(`Redis error: ${err.message}`);
        });
    }

    return client;
}

/** Close the shared client. Called from the Fastify onClose hook and by workers on shutdown. */
export async function closeRedis(): Promise<void> {
    if (!client) return;
    try {
        await client.quit();
    } catch {
        // Already closing or never connected; nothing useful to do.
    }
    client = null;
}

// ── Noisy-failure suppression ───────────────────────────────────────────────
const reported = new Map<string, number>();
const REPORT_INTERVAL_MS = 60_000;

function reportOnce(message: string): void {
    const last = reported.get(message) ?? 0;
    if (Date.now() - last < REPORT_INTERVAL_MS) return;
    reported.set(message, Date.now());
    console.warn(`[cache] ${message}`);
}

/**
 * Read and parse a cached JSON value, or null on miss, parse failure or any Redis problem.
 *
 * A parse failure is treated as a miss rather than an error: it means the stored shape predates
 * the current code, and the right response is to recompute and overwrite.
 */
export async function cacheGetJson<T>(key: string): Promise<T | null> {
    try {
        const raw = await getRedis().get(key);
        if (raw === null) return null;
        return JSON.parse(raw) as T;
    } catch (err) {
        reportOnce(`read failed for "${key}": ${(err as Error).message}`);
        return null;
    }
}

/** Store a JSON value with a TTL in seconds. Returns whether it was stored. */
export async function cacheSetJson(key: string, value: unknown, ttlSeconds: number): Promise<boolean> {
    try {
        await getRedis().set(key, JSON.stringify(value), 'EX', ttlSeconds);
        return true;
    } catch (err) {
        reportOnce(`write failed for "${key}": ${(err as Error).message}`);
        return false;
    }
}

/** Drop a key. Used to invalidate on write rather than waiting out the TTL. */
export async function cacheDelete(key: string): Promise<void> {
    try {
        await getRedis().del(key);
    } catch (err) {
        reportOnce(`delete failed for "${key}": ${(err as Error).message}`);
    }
}

/**
 * Wrap a computation in a cache.
 *
 * `null` and `undefined` results are NOT cached: in this codebase they mean "not enough data
 * yet", which is exactly the state a new submission is supposed to change. Caching it would make
 * a role+city stay "no data" for an hour after it crossed the threshold.
 */
export async function cached<T>(
    key: string,
    ttlSeconds: number,
    compute: () => Promise<T>,
): Promise<T> {
    const hit = await cacheGetJson<T>(key);
    if (hit !== null) return hit;

    const value = await compute();
    if (value !== null && value !== undefined) {
        await cacheSetJson(key, value, ttlSeconds);
    }
    return value;
}
