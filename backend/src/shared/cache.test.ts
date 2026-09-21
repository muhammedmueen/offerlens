import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * The fail-soft behaviour is the point of these tests.
 *
 * A cache is an optimisation: when Redis is unreachable the correct outcome is a miss and a
 * database hit, never a failed request. That is easy to get wrong and impossible to notice in
 * development, where Redis is always up — so it is asserted rather than assumed.
 *
 * ioredis is mocked because these are unit tests; the integration path is exercised by the live
 * suites, which run against a real Redis in Docker.
 */

const store = new Map<string, string>();
const fake = {
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, value: string) => { store.set(key, value); return 'OK'; }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    quit: vi.fn(async () => 'OK'),
    on: vi.fn(),
    status: 'ready',
};

// A function expression, not an arrow: `new Redis(...)` needs a constructable target, and
// returning an object from a constructor overrides `this`.
vi.mock('ioredis', () => ({
    Redis: vi.fn(function MockRedis() { return fake; }),
}));

vi.mock('@/config/index.js', () => ({
    config: { REDIS_URL: 'redis://localhost:6379' },
}));

const load = async () => import('./cache.js');

beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
    fake.get.mockImplementation(async (key: string) => store.get(key) ?? null);
    fake.set.mockImplementation(async (key: string, value: string) => { store.set(key, value); return 'OK'; });
    fake.del.mockImplementation(async (key: string) => { store.delete(key); return 1; });
    vi.resetModules();
});

afterEach(() => {
    vi.resetModules();
});

describe('round trip', () => {
    it('stores and reads JSON', async () => {
        const { cacheSetJson, cacheGetJson } = await load();

        expect(await cacheSetJson('k', [1, 2, 3], 60)).toBe(true);
        expect(await cacheGetJson<number[]>('k')).toEqual([1, 2, 3]);
    });

    it('returns null for a key that was never set', async () => {
        const { cacheGetJson } = await load();
        expect(await cacheGetJson('absent')).toBeNull();
    });

    it('deletes', async () => {
        const { cacheSetJson, cacheDelete, cacheGetJson } = await load();

        await cacheSetJson('k', 'v', 60);
        await cacheDelete('k');
        expect(await cacheGetJson('k')).toBeNull();
    });

    it('passes the TTL through as an expiry', async () => {
        const { cacheSetJson } = await load();
        await cacheSetJson('k', 'v', 3600);
        expect(fake.set).toHaveBeenCalledWith('k', '"v"', 'EX', 3600);
    });
});

describe('fails soft', () => {
    it('treats a read error as a miss', async () => {
        const { cacheGetJson } = await load();
        fake.get.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        expect(await cacheGetJson('k')).toBeNull();
    });

    it('treats unparseable stored data as a miss, not an error', async () => {
        // Means the stored shape predates the current code. Recompute and overwrite.
        const { cacheGetJson } = await load();
        store.set('k', '{ this is not json');

        expect(await cacheGetJson('k')).toBeNull();
    });

    it('reports a write failure without throwing', async () => {
        const { cacheSetJson } = await load();
        fake.set.mockRejectedValueOnce(new Error('READONLY'));

        expect(await cacheSetJson('k', 'v', 60)).toBe(false);
    });

    it('swallows a delete failure', async () => {
        const { cacheDelete } = await load();
        fake.del.mockRejectedValueOnce(new Error('ECONNREFUSED'));

        await expect(cacheDelete('k')).resolves.toBeUndefined();
    });

    it('registers an error listener, so a reconnect storm cannot kill the process', async () => {
        // ioredis emits `error` on every retry. Unhandled, those become unhandled error events.
        const { getRedis } = await load();
        getRedis();

        expect(fake.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
});

describe('cached()', () => {
    it('computes on a miss and serves the cache on the next call', async () => {
        const { cached } = await load();
        const compute = vi.fn(async () => [10, 20]);

        expect(await cached('k', 60, compute)).toEqual([10, 20]);
        expect(await cached('k', 60, compute)).toEqual([10, 20]);
        expect(compute).toHaveBeenCalledTimes(1);
    });

    it('still returns the computed value when the cache write fails', async () => {
        const { cached } = await load();
        fake.set.mockRejectedValue(new Error('ECONNREFUSED'));

        expect(await cached('k', 60, async () => 'value')).toBe('value');
    });

    it('recomputes every time when reads fail, rather than erroring', async () => {
        const { cached } = await load();
        fake.get.mockRejectedValue(new Error('ECONNREFUSED'));
        const compute = vi.fn(async () => 'value');

        expect(await cached('k', 60, compute)).toBe('value');
        expect(await cached('k', 60, compute)).toBe('value');
        expect(compute).toHaveBeenCalledTimes(2);
    });

    it('does NOT cache null', async () => {
        // In this codebase null means "not enough data yet" — the exact state a new submission is
        // meant to change. Caching it would keep a role+city reading "no data" for an hour after
        // it crossed the threshold.
        const { cached } = await load();
        const compute = vi.fn(async () => null);

        await cached('k', 60, compute);
        await cached('k', 60, compute);

        expect(compute).toHaveBeenCalledTimes(2);
        expect(fake.set).not.toHaveBeenCalled();
    });

    it('caches falsy values that are real answers', async () => {
        // 0 and [] are legitimate results and must not be confused with "no result".
        const { cached } = await load();
        const zero = vi.fn(async () => 0);

        await cached('zero', 60, zero);
        await cached('zero', 60, zero);
        expect(zero).toHaveBeenCalledTimes(1);

        const empty = vi.fn(async () => [] as number[]);
        await cached('empty', 60, empty);
        await cached('empty', 60, empty);
        expect(empty).toHaveBeenCalledTimes(1);
    });
});

describe('the shared client', () => {
    it('is created once per process', async () => {
        const { getRedis } = await load();
        expect(getRedis()).toBe(getRedis());
    });

    it('can be closed and rebuilt', async () => {
        const { getRedis, closeRedis } = await load();

        getRedis();
        await closeRedis();
        expect(fake.quit).toHaveBeenCalled();

        // A fresh client after close, rather than a dead one handed out forever.
        expect(getRedis()).toBeDefined();
    });

    it('does not throw when closing a client that never connected', async () => {
        const { closeRedis } = await load();
        await expect(closeRedis()).resolves.toBeUndefined();
    });
});
