import { describe, it, expect, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';

/**
 * Prove the TRUST_PROXY wiring in app.ts does what the config knob promises (audit D10):
 * the same `TRUST_PROXY === 0 ? false : TRUST_PROXY` expression app.ts passes to Fastify.
 *
 * With a positive hop count request.ip is the first X-Forwarded-For entry (the real client);
 * with 0 (off) it is the socket address and the header is ignored. A route echoes request.ip
 * so the assertion reads exactly what a handler, the rate limiter and the login IP limit see.
 */
function buildWithTrustProxy(trustProxy: number): FastifyInstance {
    const app = Fastify({
        trustProxy: trustProxy === 0 ? false : trustProxy,
        logger: false,
    });
    app.get('/ip', async (req) => ({ ip: req.ip }));
    return app;
}

let app: FastifyInstance;
afterEach(async () => { await app?.close(); });

describe('trustProxy wiring (TRUST_PROXY)', () => {
    // One hop (the guide's single host nginx) means one X-Forwarded-For entry: the real client.
    // proxy-addr with a hop count of 1 trusts exactly that one entry from the right, so with a
    // single-entry header request.ip is that client — the "first" X-Forwarded-For entry.
    const oneHop = { 'x-forwarded-for': '203.0.113.7' };

    it('with 1 hop, request.ip is the first X-Forwarded-For entry', async () => {
        app = buildWithTrustProxy(1);
        const res = await app.inject({ method: 'GET', url: '/ip', headers: oneHop });
        expect(res.json().ip).toBe('203.0.113.7');
    });

    it('with 0 (off), request.ip is NOT taken from X-Forwarded-For', async () => {
        app = buildWithTrustProxy(0);
        const res = await app.inject({ method: 'GET', url: '/ip', headers: oneHop });
        expect(res.json().ip).not.toBe('203.0.113.7');
        // inject reports the socket address as 127.0.0.1.
        expect(res.json().ip).toBe('127.0.0.1');
    });

    // Guard against the "hop count is from the right" surprise: with two entries and a count of 1,
    // request.ip is the second (the near proxy), not the leftmost client. One hop = one entry.
    it('with 1 hop and two X-Forwarded-For entries, ip is the entry one hop in, not the leftmost', async () => {
        app = buildWithTrustProxy(1);
        const res = await app.inject({
            method: 'GET',
            url: '/ip',
            headers: { 'x-forwarded-for': '203.0.113.7, 10.0.0.1' },
        });
        expect(res.json().ip).toBe('10.0.0.1');
    });
});
