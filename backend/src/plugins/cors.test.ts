import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import corsPlugin from './cors.js';

vi.mock('@/config/index.js', () => ({
    get config() {
        return { CORS_ORIGIN: 'http://localhost:8080' };
    },
}));

/**
 * The frontend is cross-origin (8080 to 8000), so every non-simple method is preflighted and
 * the browser blocks the call unless the method is in Access-Control-Allow-Methods. PATCH was
 * missing, so saving a correction (CorrectionsPanel, `api.patch`) failed in every browser.
 *
 * Methods the frontend uses (grep frontend/src for api.get/post/put/patch/delete): GET, POST,
 * PATCH and DELETE (see FRONTEND_ENDPOINTS in app.contract.test.ts). PUT is allowed too.
 */
describe('CORS preflight', () => {
    it.each(['GET', 'POST', 'PUT', 'PATCH', 'DELETE'])(
        'allows %s from the frontend origin',
        async (method) => {
            const app = Fastify();
            await app.register(corsPlugin);
            const res = await app.inject({
                method: 'OPTIONS',
                url: '/api/v1/offers/x/corrections',
                headers: {
                    origin: 'http://localhost:8080',
                    'access-control-request-method': method,
                },
            });
            const allowed = String(res.headers['access-control-allow-methods']).split(/,\s*/);
            expect(allowed).toContain(method);
            expect(res.headers['access-control-allow-credentials']).toBe('true');
            await app.close();
        },
    );
});
