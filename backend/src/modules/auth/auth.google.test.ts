import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import { errorHandler } from '@/middleware/error-handler.js';

// AUTH-1: Google login must only accept tokens issued to our client, must never use an unverified
// email, and must not let a second Google account into an account already linked to another.
// Google is mocked: google-auth-library's OAuth2Client, and `fetch` for userinfo.

const CLIENT_ID = 'ours.apps.googleusercontent.com';
vi.mock('@/config/index.js', () => ({
    get config() { return { NODE_ENV: 'test', JWT_SECRET: 'test-secret', GOOGLE_CLIENT_ID: CLIENT_ID }; },
}));

// `eq(column, value)` becomes a plain { col, val } so the in-memory db below can match on it.
vi.mock('drizzle-orm', async (orig) => ({
    ...(await orig<typeof import('drizzle-orm')>()),
    eq: (col: { name: string }, val: unknown) => ({ col: col.name, val }),
}));

type Row = { id: string; email: string; passwordHash: string | null; googleId: string | null; name: string | null; avatarUrl: string | null; isEmailVerified?: boolean };
const COLUMN: Record<string, keyof Row> = { id: 'id', email: 'email', google_id: 'googleId' };

const { store, issued, getTokenInfo, verifyIdToken } = vi.hoisted(() => ({
    store: [] as Row[],
    issued: [] as unknown[],
    getTokenInfo: vi.fn(),
    verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
    OAuth2Client: class { getTokenInfo = getTokenInfo; verifyIdToken = verifyIdToken; },
}));

vi.mock('@/db/index.js', () => {
    const match = (w: { col: string; val: unknown }) => (r: Row) => r[COLUMN[w.col]] === w.val;
    return {
        db: {
            query: { users: { findFirst: async ({ where }: { where: { col: string; val: unknown } }) => store.find(match(where)) } },
            insert: () => ({
                values: (v: Record<string, unknown>) => {
                    if ('tokenHash' in v) { issued.push(v); return Promise.resolve(); }
                    const row = { id: `u${store.length + 1}`, passwordHash: null, ...v } as Row;
                    store.push(row);
                    return { returning: async () => [row] };
                },
            }),
            update: () => ({
                set: (s: Partial<Row>) => ({
                    where: async (w: { col: string; val: unknown }) => { Object.assign(store.find(match(w))!, s); },
                }),
            }),
        },
    };
});

const { AuthService } = await import('./auth.service.js');
const { authRoutes } = await import('./auth.routes.js');
const service = new AuthService();

const TOKEN = 'ya29.secret-access-token';
const tokenInfo = (over: Record<string, unknown> = {}) => ({
    aud: CLIENT_ID, azp: CLIENT_ID, sub: 'g-1', email: 'Victim@Example.com', email_verified: 'true',
    scopes: ['openid', 'https://www.googleapis.com/auth/userinfo.email', 'https://www.googleapis.com/auth/userinfo.profile'],
    expiry_date: Date.now() + 3600_000,
    ...over,
});
const idPayload = (over: Record<string, unknown> = {}) => ({
    sub: 'g-1', email: 'victim@example.com', email_verified: true, name: 'Vic', picture: 'p.png', ...over,
});
const passwordAccount = (over: Partial<Row> = {}): Row => ({
    id: 'victim', email: 'victim@example.com', passwordHash: 'hash', googleId: null, name: 'Victim', avatarUrl: null, ...over,
});
const userinfo = vi.fn();
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

const REJECTED = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Google sign-in failed. Please try again.' };

beforeEach(() => {
    store.length = 0;
    issued.length = 0;
    getTokenInfo.mockReset().mockResolvedValue(tokenInfo());
    verifyIdToken.mockReset().mockResolvedValue({ getPayload: () => idPayload() });
    userinfo.mockReset().mockResolvedValue(new Response(JSON.stringify({ sub: 'g-1', name: 'Vic', picture: 'p.png' }), { status: 200 }));
    vi.stubGlobal('fetch', userinfo);
    warn.mockClear();
});
afterEach(() => {
    vi.unstubAllGlobals();
    // The token never reaches the log, whatever the outcome.
    for (const call of warn.mock.calls) expect(call.join(' ')).not.toContain(TOKEN);
});

describe('access token (implicit flow)', () => {
    it('a token issued to another client is a 401: no user, no link, no tokens, userinfo never asked', async () => {
        store.push(passwordAccount());
        getTokenInfo.mockResolvedValue(tokenInfo({ aud: 'other-app.apps.googleusercontent.com', azp: 'other-app.apps.googleusercontent.com' }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store).toEqual([passwordAccount()]);
        expect(issued).toHaveLength(0);
        expect(userinfo).not.toHaveBeenCalled();
        expect(getTokenInfo).toHaveBeenCalledWith(TOKEN);
    });

    it('an unverified email is refused and is not linked to the password account with that email', async () => {
        store.push(passwordAccount());
        getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: 'false' }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store[0].googleId).toBeNull();
        expect(issued).toHaveLength(0);
    });

    it('a missing email_verified is refused like false', async () => {
        getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: undefined }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store).toHaveLength(0);
    });

    it('a verified email links Google to the matching password account and logs into it', async () => {
        store.push(passwordAccount());
        const res = await service.googleAuth({ accessToken: TOKEN });
        expect(res.user.id).toBe('victim');
        expect(store).toHaveLength(1);
        expect(store[0]).toMatchObject({ googleId: 'g-1', passwordHash: 'hash', avatarUrl: 'p.png' });
        expect(issued).toHaveLength(1);
        expect(res.tokens.accessToken).toEqual(expect.any(String));
    });

    it('an account already linked to a different Google account is refused', async () => {
        store.push(passwordAccount({ googleId: 'g-other' }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store[0].googleId).toBe('g-other');
        expect(issued).toHaveLength(0);
    });

    it('a new verified email creates the user with its Google id', async () => {
        const res = await service.googleAuth({ accessToken: TOKEN });
        expect(store).toHaveLength(1);
        expect(store[0]).toMatchObject({ email: 'victim@example.com', googleId: 'g-1', name: 'Vic', avatarUrl: 'p.png', isEmailVerified: true });
        expect(res.user.id).toBe(store[0].id);
        expect(issued).toHaveLength(1);
    });

    it('a returning Google user is found by Google id even after their Google email changed', async () => {
        store.push(passwordAccount({ googleId: 'g-1' }));
        getTokenInfo.mockResolvedValue(tokenInfo({ email: 'new-address@example.com' }));
        const res = await service.googleAuth({ accessToken: TOKEN });
        expect(res.user.id).toBe('victim');
        expect(store).toHaveLength(1);
    });

    it('an invalid or expired token (tokeninfo 400) is a 401', async () => {
        getTokenInfo.mockRejectedValue(Object.assign(new Error(`bad token ${TOKEN}`), { name: 'GaxiosError', response: { status: 400 } }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store).toHaveLength(0);
        expect(issued).toHaveLength(0);
        expect(warn.mock.calls.flat().join(' ')).toContain('GaxiosError 400');
    });

    it('a token past its expiry is a 401', async () => {
        getTokenInfo.mockResolvedValue(tokenInfo({ expiry_date: Date.now() - 1000 }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(issued).toHaveLength(0);
    });

    it('a token without the email scope is a 401', async () => {
        getTokenInfo.mockResolvedValue(tokenInfo({ scopes: ['openid', 'https://www.googleapis.com/auth/drive.readonly'] }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(issued).toHaveLength(0);
    });

    it('accepts the bare "email" scope and a boolean email_verified', async () => {
        getTokenInfo.mockResolvedValue(tokenInfo({ scopes: ['openid', 'email'], email_verified: true }));
        await expect(service.googleAuth({ accessToken: TOKEN })).resolves.toMatchObject({ user: { email: 'victim@example.com' } });
    });

    it('a userinfo failure after a good tokeninfo is a 401', async () => {
        userinfo.mockResolvedValue(new Response('{}', { status: 401 }));
        await expect(service.googleAuth({ accessToken: TOKEN })).rejects.toMatchObject(REJECTED);
        expect(store).toHaveLength(0);
    });
});

describe('ID token', () => {
    it('is still verified against our client id', async () => {
        await service.googleAuth({ idToken: 'id.jwt' });
        expect(verifyIdToken).toHaveBeenCalledWith({ idToken: 'id.jwt', audience: CLIENT_ID });
    });

    it('an unverified email is refused and not linked', async () => {
        store.push(passwordAccount());
        verifyIdToken.mockResolvedValue({ getPayload: () => idPayload({ email_verified: false }) });
        await expect(service.googleAuth({ idToken: 'id.jwt' })).rejects.toMatchObject(REJECTED);
        expect(store[0].googleId).toBeNull();
        expect(issued).toHaveLength(0);
    });

    it('an account linked to a different Google account is refused', async () => {
        store.push(passwordAccount({ googleId: 'g-other' }));
        await expect(service.googleAuth({ idToken: 'id.jwt' })).rejects.toMatchObject(REJECTED);
        expect(issued).toHaveLength(0);
    });

    it('a valid token logs into the account already linked to it, unchanged', async () => {
        store.push(passwordAccount({ googleId: 'g-1' }));
        const res = await service.googleAuth({ idToken: 'id.jwt' });
        expect(res.user).toEqual({ id: 'victim', email: 'victim@example.com', name: 'Victim', avatarUrl: null });
        expect(store).toEqual([passwordAccount({ googleId: 'g-1' })]);
        expect(issued).toHaveLength(1);
    });

    it('a token that fails verification is a 401, and its error message (which can carry the JWT) is not logged', async () => {
        verifyIdToken.mockRejectedValue(new Error('Invalid token signature: id.jwt'));
        await expect(service.googleAuth({ idToken: 'id.jwt' })).rejects.toMatchObject(REJECTED);
        expect(warn.mock.calls.flat().join(' ')).not.toContain('id.jwt');
    });
});

describe('POST /auth/google responses', () => {
    async function post(payload: Record<string, unknown>) {
        const app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.setErrorHandler(errorHandler);
        await app.register(authRoutes, { prefix: '/auth' });
        const res = await app.inject({ method: 'POST', url: '/auth/google', payload });
        await app.close();
        return res;
    }

    it('every rejection has the same status and body, whether or not an account exists', async () => {
        const cases: Array<() => void> = [
            () => getTokenInfo.mockResolvedValue(tokenInfo({ aud: 'other-app' })),
            () => getTokenInfo.mockRejectedValue(Object.assign(new Error('x'), { response: { status: 400 } })),
            () => getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: 'false' })),
            () => { store.push(passwordAccount()); getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: 'false' })); },
            () => store.push(passwordAccount({ googleId: 'g-other' })),
        ];
        const bodies = new Set<string>();
        for (const arrange of cases) {
            store.length = 0;
            getTokenInfo.mockReset().mockResolvedValue(tokenInfo());
            arrange();
            const res = await post({ accessToken: TOKEN });
            expect(res.statusCode).toBe(401);
            bodies.add(res.body);
        }
        expect(issued).toHaveLength(0);
        expect(bodies.size).toBe(1);
        expect(JSON.parse([...bodies][0])).toEqual({
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: 'Google sign-in failed. Please try again.' },
        });
    });

    it('a good token still returns tokens', async () => {
        const res = await post({ accessToken: TOKEN });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.tokens.accessToken).toEqual(expect.any(String));
    });
});
