import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { serializerCompiler, validatorCompiler } from 'fastify-type-provider-zod';
import fp from 'fastify-plugin';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { errorHandler } from '@/middleware/error-handler.js';
import { registerRateLimiter } from '@/middleware/rate-limiter.js';
import guestIdentityPlugin from '@/plugins/guest-identity.js';

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
type TokenRow = { userId: string; tokenHash: string; expiresAt: Date };
const COLUMN: Record<string, string> = { id: 'id', email: 'email', google_id: 'googleId', user_id: 'userId', token_hash: 'tokenHash' };

// `issued` is the refresh_tokens table. `dbLog` records each write, prefixed `tx.` inside a transaction.
const { store, issued, dbLog, getTokenInfo, verifyIdToken } = vi.hoisted(() => ({
    store: [] as Row[],
    issued: [] as TokenRow[],
    dbLog: [] as string[],
    getTokenInfo: vi.fn(),
    verifyIdToken: vi.fn(),
}));

vi.mock('google-auth-library', () => ({
    OAuth2Client: class { getTokenInfo = getTokenInfo; verifyIdToken = verifyIdToken; },
}));

vi.mock('@/db/index.js', () => {
    type Where = { col: string; val: unknown };
    const match = (w: Where) => (r: object) => (r as Record<string, unknown>)[COLUMN[w.col]] === w.val;
    const writes = (tag: string) => ({
        insert: () => ({
            values: (v: Record<string, unknown>) => {
                dbLog.push(`${tag}insert`);
                if ('tokenHash' in v) { issued.push(v as TokenRow); return Promise.resolve(); }
                const row = { id: `u${store.length + 1}`, passwordHash: null, ...v } as Row;
                store.push(row);
                return { returning: async () => [row] };
            },
        }),
        update: () => ({
            set: (s: Partial<Row>) => ({
                where: async (w: Where) => { dbLog.push(`${tag}update`); Object.assign(store.find(match(w))!, s); },
            }),
        }),
        // Only refresh tokens are ever deleted by AuthService.
        delete: () => ({
            where: (w: Where) => {
                dbLog.push(`${tag}delete`);
                const gone = issued.filter(match(w));
                issued.splice(0, issued.length, ...issued.filter((t) => !gone.includes(t)));
                return Object.assign(Promise.resolve(), { returning: async () => gone });
            },
        }),
    });
    return {
        db: {
            query: {
                users: { findFirst: async ({ where }: { where: Where }) => store.find(match(where)) },
                guests: { findFirst: async () => undefined },
            },
            ...writes(''),
            transaction: async (fn: (tx: ReturnType<typeof writes>) => Promise<unknown>) => {
                dbLog.push('begin');
                const result = await fn(writes('tx.'));
                dbLog.push('commit');
                return result;
            },
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
// Password signup leaves isEmailVerified false; nothing sets it true.
const passwordAccount = (over: Partial<Row> = {}): Row => ({
    id: 'victim', email: 'victim@example.com', passwordHash: 'hash', googleId: null, name: 'Victim', avatarUrl: null, isEmailVerified: false, ...over,
});
const sha256 = (s: string) => crypto.createHash('sha256').update(s).digest('hex');
/** A live refresh token row, as `generateTokens` stores it. */
const session = (userId: string, value: string): TokenRow => ({ userId, tokenHash: sha256(value), expiresAt: new Date(Date.now() + 3600_000) });
const userinfo = vi.fn();
const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
/** Lines the Fastify request logger wrote (error-handler logs `{ err }` at warn for a 4xx AppError). */
const fastifyLogs: string[] = [];

const REJECTED = { statusCode: 401, code: 'INVALID_CREDENTIALS', message: 'Google sign-in failed. Please try again.' };

beforeEach(() => {
    store.length = 0;
    issued.length = 0;
    dbLog.length = 0;
    fastifyLogs.length = 0;
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
    for (const line of fastifyLogs) expect(line).not.toContain(TOKEN);
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
        expect(store[0]).toMatchObject({ googleId: 'g-1', avatarUrl: 'p.png' });
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

describe('AUTH-8: linking Google to a password account whose email was never verified', () => {
    // An attacker signs up with a password at the victim's address before the victim joins.
    it('removes the password, marks the email verified and revokes every session, in one transaction', async () => {
        store.push(passwordAccount());
        issued.push(session('victim', 'attacker-refresh-1'), session('victim', 'attacker-refresh-2'), session('someone-else', 'other-refresh'));

        const res = await service.googleAuth({ accessToken: TOKEN });

        expect(res.user.id).toBe('victim');
        expect(store).toEqual([passwordAccount({ googleId: 'g-1', avatarUrl: 'p.png', passwordHash: null, isEmailVerified: true })]);
        // Only the victim's prior tokens are gone, and only the new login's token was added.
        expect(issued.map((t) => t.userId)).toEqual(['someone-else', 'victim']);
        expect(issued[1].tokenHash).toBe(sha256(res.tokens.refreshToken));
        expect(dbLog).toEqual(['begin', 'tx.update', 'tx.delete', 'commit', 'insert']);
    });

    it('a pre-link refresh token no longer refreshes', async () => {
        store.push(passwordAccount());
        issued.push(session('victim', 'attacker-refresh'));
        await service.googleAuth({ accessToken: TOKEN });
        await expect(service.refreshAccessToken('attacker-refresh')).rejects.toMatchObject({ statusCode: 401, code: 'TOKEN_EXPIRED' });
    });

    it('an account whose email is already verified is linked as before: password and sessions kept', async () => {
        store.push(passwordAccount({ isEmailVerified: true }));
        issued.push(session('victim', 'own-refresh'));

        await service.googleAuth({ accessToken: TOKEN });

        expect(store[0]).toMatchObject({ googleId: 'g-1', passwordHash: 'hash', isEmailVerified: true });
        expect(dbLog).not.toContain('begin');
        expect(dbLog).not.toContain('delete');
        await expect(service.refreshAccessToken('own-refresh')).resolves.toMatchObject({ refreshToken: expect.any(String) });
    });

    it('password signup for the now Google-linked address is still a 409 and does not re-add a password', async () => {
        store.push(passwordAccount());
        await service.googleAuth({ accessToken: TOKEN });
        await expect(service.signup({ email: 'Victim@Example.com', password: 'new-password' }))
            .rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_IN_USE' });
        expect(store).toHaveLength(1);
        expect(store[0].passwordHash).toBeNull();
    });
});

/** The real routes behind the real error handler, rate limiter and guest cookie, logging to `fastifyLogs`. */
async function post(url: string, payload: Record<string, unknown>) {
    const app = Fastify({ logger: { level: 'info', stream: { write: (line: string) => { fastifyLogs.push(line); } } } });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.setErrorHandler(errorHandler);
    await app.register(fp(async (f) => { f.decorate('redis', null as never); }, { name: 'redis' }));
    await app.register(guestIdentityPlugin);
    await app.register(registerRateLimiter);
    await app.register(authRoutes, { prefix: '/auth' });
    const res = await app.inject({ method: 'POST', url, payload });
    await app.close();
    return res;
}

describe('AUTH-8: password login after the link', () => {
    it('the old password gets the same 401 body as a wrong password, not a 500', async () => {
        store.push(passwordAccount({ passwordHash: await bcrypt.hash('old-password', 4) }));
        const credentials = { email: 'victim@example.com', password: 'old-password' };

        expect((await post('/auth/login', credentials)).statusCode).toBe(200); // the password worked before
        const wrong = await post('/auth/login', { ...credentials, password: 'not-the-password' });

        expect((await post('/auth/google', { accessToken: TOKEN })).statusCode).toBe(200);
        const after = await post('/auth/login', credentials);

        expect(wrong.statusCode).toBe(401);
        expect(after.statusCode).toBe(401);
        expect(after.body).toBe(wrong.body);
        expect(after.json()).toEqual({ success: false, error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' } });
    });
});

describe('POST /auth/google responses', () => {
    it('every rejection has the same status and body, whether or not an account exists', async () => {
        const cases: Array<() => void> = [
            () => getTokenInfo.mockResolvedValue(tokenInfo({ aud: 'other-app' })),
            // Google's error can quote the token; it must not reach the request log via the AppError.
            () => getTokenInfo.mockRejectedValue(Object.assign(new Error(`bad token ${TOKEN}`), { response: { status: 400 } })),
            () => getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: 'false' })),
            () => { store.push(passwordAccount()); getTokenInfo.mockResolvedValue(tokenInfo({ email_verified: 'false' })); },
            () => store.push(passwordAccount({ googleId: 'g-other' })),
        ];
        const bodies = new Set<string>();
        for (const arrange of cases) {
            store.length = 0;
            getTokenInfo.mockReset().mockResolvedValue(tokenInfo());
            arrange();
            const res = await post('/auth/google', { accessToken: TOKEN });
            expect(res.statusCode).toBe(401);
            bodies.add(res.body);
        }
        // The request logger saw every rejection; afterEach checks no line carries the token.
        expect(fastifyLogs.filter((l) => l.includes('AppError (4xx)'))).toHaveLength(cases.length);
        expect(issued).toHaveLength(0);
        expect(bodies.size).toBe(1);
        expect(JSON.parse([...bodies][0])).toEqual({
            success: false,
            error: { code: 'INVALID_CREDENTIALS', message: 'Google sign-in failed. Please try again.' },
        });
    });

    it('a good token still returns tokens', async () => {
        const res = await post('/auth/google', { accessToken: TOKEN });
        expect(res.statusCode).toBe(200);
        expect(res.json().data.tokens.accessToken).toEqual(expect.any(String));
    });
});
