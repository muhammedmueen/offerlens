import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { GUEST, PLANS } from '@/config/plans.js';

// FLOW-1 / AUTH-2: a request that CARRIES a Bearer which fails verification gets 401
// TOKEN_EXPIRED on guest-capable routes, never a silent guest. No Bearer stays a true guest
// (ADR-001). The body-authenticated /auth routes ignore a stale Bearer (B9).
// Real `authenticate`, real routes, Fastify inject; DB and services mocked.

const SECRET = 'test-secret';

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', JWT_SECRET: SECRET }; } }));

const {
    findFirst, create, getAnalysis, findByToken, getOrCreateGuest, tierForRequest, readCounts,
    extractMetadataFromText, extractTextFromFile, getById, getRoles, getCities, getExperienceLevels,
} = vi.hoisted(() => ({
    findFirst: vi.fn(),
    create: vi.fn(),
    getAnalysis: vi.fn(),
    findByToken: vi.fn(),
    getOrCreateGuest: vi.fn(),
    tierForRequest: vi.fn(),
    readCounts: vi.fn(),
    extractMetadataFromText: vi.fn(),
    extractTextFromFile: vi.fn(),
    getById: vi.fn(),
    getRoles: vi.fn(),
    getCities: vi.fn(),
    getExperienceLevels: vi.fn(),
}));

vi.mock('@/db/index.js', () => ({ db: { query: { offers: { findFirst } } } }));
vi.mock('@/modules/offer/offer.service.js', () => ({
    OfferService: class {
        create = create;
        extractMetadataFromText = extractMetadataFromText;
        extractTextFromFile = extractTextFromFile;
        getById = getById;
    },
}));
vi.mock('@/modules/metadata/metadata.service.js', () => ({
    MetadataService: class {
        getRoles = getRoles;
        getCities = getCities;
        getExperienceLevels = getExperienceLevels;
    },
}));
vi.mock('@/modules/analysis/analysis.service.js', () => ({ AnalysisService: class { getAnalysis = getAnalysis; } }));
vi.mock('@/modules/guest/guest.service.js', () => ({
    GuestService: class {
        findByToken = findByToken;
        getOrCreateGuest = getOrCreateGuest;
    },
}));
vi.mock('@/modules/quota/quota.service.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/modules/quota/quota.service.js')>()),
    tierForRequest: (...a: unknown[]) => tierForRequest(...a),
    readCounts: (...a: unknown[]) => readCounts(...a),
}));

const { authenticate } = await import('./authenticate.js');
const { AuthService } = await import('@/modules/auth/auth.service.js');
const { errorHandler } = await import('./error-handler.js');
const { registerRateLimiter } = await import('./rate-limiter.js');
const { default: guestIdentityPlugin } = await import('@/plugins/guest-identity.js');
const { default: multipartPlugin } = await import('@/plugins/multipart.js');
const { offerRoutes } = await import('@/modules/offer/offer.routes.js');
const { analysisRoutes } = await import('@/modules/analysis/analysis.routes.js');
const { quotaRoutes } = await import('@/modules/quota/quota.routes.js');
const { authRoutes } = await import('@/modules/auth/auth.routes.js');
const { metadataRoutes } = await import('@/modules/metadata/metadata.routes.js');
const { AppError } = await import('@/shared/errors/app-error.js');
const { ERROR_CODES } = await import('@/shared/errors/error-codes.js');

const token = (opts?: jwt.SignOptions) => jwt.sign({ userId: 'u1', email: 'u1@example.com' }, SECRET, opts);
const EXPIRED = `Bearer ${token({ expiresIn: '-1s' })}`;
const VALID = `Bearer ${token()}`;
const GARBAGE = 'Bearer not-a-jwt';
const OFFER_ID = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const redisStub = fp(async (f) => { f.decorate('redis', null as never); }, { name: 'redis' });

let app: FastifyInstance;
beforeAll(async () => {
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler(errorHandler);
    await app.register(redisStub);
    await app.register(multipartPlugin);
    await app.register(guestIdentityPlugin);
    await app.register(registerRateLimiter);
    app.addHook('onRequest', authenticate);
    await app.register(async (api) => {
        await api.register(authRoutes, { prefix: '/auth' });
        await api.register(offerRoutes, { prefix: '/offers' });
        await api.register(analysisRoutes);
        await api.register(metadataRoutes, { prefix: '/metadata' });
        await api.register(quotaRoutes);
    }, { prefix: '/api/v1' });
    await app.ready();
}, 30_000);
afterAll(async () => { await app?.close(); });

const user = { id: 'u1', email: 'u1@example.com' };
const tokens = { accessToken: 'a', refreshToken: 'r' };
beforeEach(() => {
    vi.restoreAllMocks();
    for (const f of [
        findFirst, create, getAnalysis, findByToken, getOrCreateGuest, tierForRequest, readCounts,
        extractMetadataFromText, extractTextFromFile, getById, getRoles, getCities, getExperienceLevels,
    ]) f.mockReset();
    create.mockResolvedValue({ id: 'o1', status: 'QUEUED' });
    tierForRequest.mockImplementation(async (req: { userId?: string }) => (req.userId ? PLANS.free : GUEST));
    readCounts.mockResolvedValue({});
    getAnalysis.mockResolvedValue({ id: 'a1' });
    vi.spyOn(AuthService.prototype, 'login').mockResolvedValue({ user, tokens } as never);
    vi.spyOn(AuthService.prototype, 'signup').mockResolvedValue({ user, tokens } as never);
    vi.spyOn(AuthService.prototype, 'googleAuth').mockResolvedValue({ user, tokens } as never);
    vi.spyOn(AuthService.prototype, 'refreshAccessToken').mockResolvedValue(tokens as never);
    vi.spyOn(AuthService.prototype, 'logout').mockResolvedValue();
    vi.spyOn(AuthService.prototype, 'migrateGuestOffers').mockResolvedValue(0);
});

const BOUNDARY = 'X-STALE-TOKEN-BOUNDARY';
const multipartBody = [
    `--${BOUNDARY}`,
    'Content-Disposition: form-data; name="text"',
    '',
    'Offer letter text',
    `--${BOUNDARY}--`,
    '',
].join('\r\n');

const postOffer = (authorization?: string) => app.inject({
    method: 'POST', url: '/api/v1/offers',
    headers: {
        'content-type': `multipart/form-data; boundary=${BOUNDARY}`,
        ...(authorization ? { authorization } : {}),
    },
    payload: multipartBody,
});

const expectTokenExpired = (res: { statusCode: number; json(): any }) => {
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ success: false, error: { code: 'TOKEN_EXPIRED' } });
};

describe('POST /offers', () => {
    it('an expired Bearer gets 401 TOKEN_EXPIRED and no offer is created', async () => {
        expectTokenExpired(await postOffer(EXPIRED));
        expect(create).not.toHaveBeenCalled();
    });

    it('a garbage Bearer gets the same 401', async () => {
        expectTokenExpired(await postOffer(GARBAGE));
        expect(create).not.toHaveBeenCalled();
    });

    it('no Bearer is still a guest upload (control)', async () => {
        const res = await postOffer();
        expect(res.statusCode).toBe(201);
        expect(create).toHaveBeenCalledTimes(1);
        expect(create.mock.calls[0][3]).toBeUndefined();
    });

    it('a valid Bearer uploads as the user (control)', async () => {
        const res = await postOffer(VALID);
        expect(res.statusCode).toBe(201);
        expect(create.mock.calls[0][3]).toBe('u1');
    });
});

describe('GET /quota', () => {
    it('an expired Bearer gets 401 TOKEN_EXPIRED and no counters are read', async () => {
        expectTokenExpired(await app.inject({ method: 'GET', url: '/api/v1/quota', headers: { authorization: EXPIRED } }));
        expect(readCounts).not.toHaveBeenCalled();
    });

    it('no Bearer is answered as a guest', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/quota' });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.plan).toBe('guest');
    });

    it('a valid Bearer reads the user counters', async () => {
        const res = await app.inject({ method: 'GET', url: '/api/v1/quota', headers: { authorization: VALID } });
        expect(res.statusCode).toBe(200);
        expect(readCounts.mock.calls[0][0]).toEqual({ type: 'user', id: 'u1' });
    });
});

describe('GET /offers/:id/analysis', () => {
    const url = `/api/v1/offers/${OFFER_ID}/analysis`;

    it('an expired Bearer gets 401 TOKEN_EXPIRED, not the guest 404, and nothing is loaded', async () => {
        expectTokenExpired(await app.inject({ method: 'GET', url, headers: { authorization: EXPIRED } }));
        expect(findFirst).not.toHaveBeenCalled();
        expect(getAnalysis).not.toHaveBeenCalled();
    });

    it('no Bearer, the guest owns the offer: 200', async () => {
        findFirst.mockResolvedValue({ id: OFFER_ID, userId: null, guestId: 'g1' });
        findByToken.mockResolvedValue({ id: 'g1' });
        const res = await app.inject({ method: 'GET', url });
        expect(res.statusCode).toBe(200);
    });

    it('a valid Bearer, the user owns the offer: 200', async () => {
        findFirst.mockResolvedValue({ id: OFFER_ID, userId: 'u1', guestId: null });
        const res = await app.inject({ method: 'GET', url, headers: { authorization: VALID } });
        expect(res.statusCode).toBe(200);
    });
});

describe('every other guest-capable route rejects an expired Bearer', () => {
    const multipart = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` };
    it.each([
        ['POST', '/api/v1/offers/extract', '/api/v1/offers/extract', { text: 'x' }, {}],
        ['POST', '/api/v1/offers/extract-file', '/api/v1/offers/extract-file', multipartBody, multipart],
        ['GET', '/api/v1/metadata/roles', '/api/v1/metadata/roles', undefined, {}],
        ['GET', '/api/v1/metadata/cities', '/api/v1/metadata/cities', undefined, {}],
        ['GET', '/api/v1/metadata/experience-levels', '/api/v1/metadata/experience-levels', undefined, {}],
        ['GET', '/api/v1/offers/:id', `/api/v1/offers/${OFFER_ID}`, undefined, {}],
        ['GET', '/api/v1/offers/:id/report', `/api/v1/offers/${OFFER_ID}/report`, undefined, {}],
    ] as const)('%s %s: 401 TOKEN_EXPIRED, no guest work', async (method, pattern, url, payload, headers) => {
        // An unmatched URL would also get the root-hook 401, so prove the route is real.
        expect(app.hasRoute({ method, url: pattern })).toBe(true);
        expectTokenExpired(await app.inject({
            method, url, headers: { ...headers, authorization: EXPIRED },
            ...(payload !== undefined ? { payload } : {}),
        }));
        for (const f of [
            findFirst, findByToken, getOrCreateGuest, create, extractMetadataFromText, extractTextFromFile,
            getById, getRoles, getCities, getExperienceLevels,
        ]) expect(f).not.toHaveBeenCalled();
    });
});

describe('credential endpoints ignore a stale Bearer', () => {
    const post = (path: string, payload: object) => app.inject({
        method: 'POST', url: `/api/v1/auth/${path}`, headers: { authorization: EXPIRED }, payload,
    });

    it('login succeeds', async () => {
        const res = await post('login', { email: 'u1@example.com', password: 'pw' });
        expect(res.statusCode).toBe(200);
        expect(AuthService.prototype.login).toHaveBeenCalled();
    });

    it('a wrong password is still INVALID_CREDENTIALS, not TOKEN_EXPIRED', async () => {
        vi.mocked(AuthService.prototype.login).mockRejectedValue(
            new AppError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid email or password', 401),
        );
        const res = await post('login', { email: 'u1@example.com', password: 'wrong' });
        expect(res.statusCode).toBe(401);
        expect(res.json().error.code).toBe('INVALID_CREDENTIALS');
    });

    it('signup, google and refresh succeed', async () => {
        expect((await post('signup', { email: 'new@example.com', password: 'Password123!' })).statusCode).toBe(201);
        expect((await post('google', { accessToken: 'g' })).statusCode).toBe(200);
        expect((await post('refresh', { refreshToken: 'r' })).statusCode).toBe(200);
    });

    it('logout reaches the handler', async () => {
        const res = await post('logout', { refreshToken: 'r' });
        expect(res.statusCode).toBe(200);
        expect(AuthService.prototype.logout).toHaveBeenCalledWith('r');
    });

    // AUTH-5: logout is authenticated by the refresh token in its body alone.
    it('logout with no Bearer at all still revokes the refresh token', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout', payload: { refreshToken: 'r' } });
        expect(res.statusCode).toBe(200);
        expect(AuthService.prototype.logout).toHaveBeenCalledWith('r');
    });

    it('logout with no body is still a 400 and revokes nothing', async () => {
        const res = await app.inject({ method: 'POST', url: '/api/v1/auth/logout' });
        expect(res.statusCode).toBe(400);
        expect(AuthService.prototype.logout).not.toHaveBeenCalled();
    });
});
