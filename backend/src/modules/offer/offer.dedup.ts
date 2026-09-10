export type DedupScope =
    | { kind: 'user'; id: string }
    | { kind: 'guest'; id: string };

/**
 * Which owner a duplicate-text lookup should be restricted to.
 *
 * A registered user dedups against their own offers; an anonymous caller dedups
 * against the offers of their guest row. Never globally — that was the bug (ADR-001):
 * the lookup filtered on `text_hash` alone, so identical text from a different person
 * returned their offer ID, and when that offer had FAILED it was deleted.
 *
 * Lives in its own module so testing it does not import the offer service, which
 * pulls in the BullMQ queues and opens a Redis connection.
 */
export function resolveDedupScope(
    userId: string | undefined | null,
    guestRowId: string,
): DedupScope {
    return userId ? { kind: 'user', id: userId } : { kind: 'guest', id: guestRowId };
}
