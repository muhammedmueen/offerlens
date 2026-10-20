import { describe, it, expect, vi, beforeEach } from 'vitest';

// AUTH-4: refresh-token rotation claims the row with one DELETE … RETURNING, so of two
// concurrent refreshes with the same token exactly one wins and the other is a 401.

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', JWT_SECRET: 'test-secret' }; } }));

const { returning, insertValues, usersFindFirst, refreshTokensFindFirst } = vi.hoisted(() => ({
    returning: vi.fn(),
    insertValues: vi.fn(),
    usersFindFirst: vi.fn(),
    refreshTokensFindFirst: vi.fn(),
}));

vi.mock('@/db/index.js', () => ({
    db: {
        delete: vi.fn(() => ({ where: vi.fn(() => ({ returning })) })),
        insert: vi.fn(() => ({ values: insertValues })),
        query: {
            users: { findFirst: usersFindFirst },
            refreshTokens: { findFirst: refreshTokensFindFirst },
        },
    },
}));

const { AuthService } = await import('./auth.service.js');

const row = (expiresInMs: number) => ({ id: 't1', userId: 'u1', tokenHash: 'h', expiresAt: new Date(Date.now() + expiresInMs) });
const service = new AuthService();

beforeEach(() => {
    for (const f of [returning, insertValues, usersFindFirst, refreshTokensFindFirst]) f.mockReset();
    insertValues.mockResolvedValue(undefined);
    usersFindFirst.mockResolvedValue({ id: 'u1', email: 'u1@example.com' });
});

describe('refreshAccessToken rotation', () => {
    it('an unknown token is a 401 and mints nothing', async () => {
        returning.mockResolvedValue([]);
        await expect(service.refreshAccessToken('r')).rejects.toMatchObject({ statusCode: 401, code: 'TOKEN_EXPIRED' });
        expect(insertValues).not.toHaveBeenCalled();
    });

    it('an expired token is a 401 and mints nothing', async () => {
        returning.mockResolvedValue([row(-1000)]);
        await expect(service.refreshAccessToken('r')).rejects.toMatchObject({ statusCode: 401, code: 'TOKEN_EXPIRED' });
        expect(insertValues).not.toHaveBeenCalled();
    });

    it('a valid token is rotated without a separate read', async () => {
        returning.mockResolvedValue([row(60_000)]);
        const tokens = await service.refreshAccessToken('r');
        expect(tokens).toMatchObject({ accessToken: expect.any(String), refreshToken: expect.any(String) });
        expect(insertValues).toHaveBeenCalledTimes(1);
        expect(refreshTokensFindFirst).not.toHaveBeenCalled();
    });

    it('two concurrent refreshes with the same token: exactly one succeeds, the other is a 401', async () => {
        returning.mockResolvedValueOnce([row(60_000)]).mockResolvedValue([]);
        const results = await Promise.allSettled([service.refreshAccessToken('r'), service.refreshAccessToken('r')]);
        expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
        const rejected = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
        expect(rejected).toHaveLength(1);
        expect(rejected[0].reason).toMatchObject({ statusCode: 401, code: 'TOKEN_EXPIRED' });
        expect(insertValues).toHaveBeenCalledTimes(1);
    });
});
