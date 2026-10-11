import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const dir = path.join(os.tmpdir(), `offerlens-stored-file-test-${process.pid}`);

vi.mock('@/config/index.js', () => ({ get config() { return { NODE_ENV: 'test', STORAGE_PATH: dir }; } }));
const findMany = vi.hoisted(() => vi.fn());
vi.mock('@/db/index.js', () => ({
    db: {
        update: () => ({ set: () => ({ where: async () => undefined }) }),
        query: { offerFiles: { findMany } },
    },
}));

const { runThenPurgeFile, purgeStoredFile, purgeFilesOfOffers } = await import('./stored-file.js');

const exists = (p: string) => fs.access(p).then(() => true, () => false);
const job = (attemptsMade: number) => ({ attemptsMade, opts: { attempts: 3 } });

async function makeFile(name: string): Promise<string> {
    const p = path.join(dir, name);
    await fs.writeFile(p, 'offer letter');
    return p;
}

beforeAll(() => fs.mkdir(dir, { recursive: true }));
afterAll(() => fs.rm(dir, { recursive: true, force: true }));

describe('runThenPurgeFile (task 4.5)', () => {
    it('removes the file from disk after a successful run, and returns its result', async () => {
        const p = await makeFile('ok.pdf');
        await expect(runThenPurgeFile(job(0), p, async () => 'done')).resolves.toBe('done');
        expect(await exists(p)).toBe(false);
    });

    it('removes the file when the run fails on the final attempt, and rethrows', async () => {
        const p = await makeFile('final.pdf');
        await expect(runThenPurgeFile(job(2), p, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(await exists(p)).toBe(false);
    });

    it('KEEPS the file when a retry is still coming, so the retry can read it', async () => {
        const p = await makeFile('retry.pdf');
        await expect(runThenPurgeFile(job(0), p, async () => { throw new Error('boom'); })).rejects.toThrow('boom');
        expect(await exists(p)).toBe(true);
    });

    it('is a no-op for a pasted-text job, which has no file', async () => {
        await expect(runThenPurgeFile(job(0), undefined, async () => 1)).resolves.toBe(1);
    });

    it('purgeStoredFile tolerates a file that is already gone', async () => {
        await expect(purgeStoredFile(path.join(dir, 'never-existed.pdf'))).resolves.toBeUndefined();
    });
});

describe('purgeFilesOfOffers (reaper purge, task 4.5)', () => {
    it('removes the files the lookup returns', async () => {
        const p = await makeFile('reaped.pdf');
        findMany.mockResolvedValueOnce([{ storedPath: p }]);
        await expect(purgeFilesOfOffers(['offer-1'])).resolves.toBeUndefined();
        expect(await exists(p)).toBe(false);
    });

    it('swallows a failing file lookup so the reap job does not reject', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
        findMany.mockRejectedValueOnce(new Error('db down'));
        await expect(purgeFilesOfOffers(['offer-1'])).resolves.toBeUndefined();
        expect(spy).toHaveBeenCalled();
        spy.mockRestore();
    });
});
