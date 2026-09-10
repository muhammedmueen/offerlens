import { describe, it, expect } from 'vitest';
import { resolveDedupScope } from './offer.dedup.js';

const USER = 'aaaaaaaa-0000-0000-0000-000000000001';
const GUEST_ROW = 'cccccccc-0000-0000-0000-000000000003';

describe('resolveDedupScope', () => {
    it('scopes a registered upload to that user', () => {
        expect(resolveDedupScope(USER, GUEST_ROW)).toEqual({ kind: 'user', id: USER });
    });

    it('scopes an anonymous upload to that guest row', () => {
        expect(resolveDedupScope(undefined, GUEST_ROW)).toEqual({ kind: 'guest', id: GUEST_ROW });
        expect(resolveDedupScope(null, GUEST_ROW)).toEqual({ kind: 'guest', id: GUEST_ROW });
    });

    it('never returns an unscoped result', () => {
        // The original lookup filtered on text_hash alone, so identical text from a
        // different person returned their offer ID — and deleted it when FAILED.
        for (const scope of [resolveDedupScope(USER, GUEST_ROW), resolveDedupScope(undefined, GUEST_ROW)]) {
            expect(scope.id).toBeTruthy();
            expect(['user', 'guest']).toContain(scope.kind);
        }
    });

    it('prefers the user identity when the caller has both', () => {
        // A logged-in user whose browser still carries a guest cookie dedups against
        // their account, not the leftover guest row.
        expect(resolveDedupScope(USER, GUEST_ROW).kind).toBe('user');
    });
});
