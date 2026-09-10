/**
 * Local record of offers created while browsing as a guest (ADR-001).
 *
 * Two jobs:
 *  1. Guests previously persisted nothing, so the offer ID existed only in the URL —
 *     closing the tab lost the analysis permanently.
 *  2. On signup the list is presented so the server can narrow which offers to claim.
 *     It is not a credential: the server verifies every ID against the signed guest
 *     cookie, so a tampered list grants nothing.
 */
const STORAGE_KEY = "guest_offer_ids";
const MAX_TRACKED = 50; // Matches the server-side cap on the claim list.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function getGuestOfferIds(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Filter defensively: this is user-writable storage.
    return parsed.filter((id): id is string => typeof id === "string" && UUID_RE.test(id));
  } catch {
    return [];
  }
}

export function rememberGuestOffer(offerId: string): void {
  if (!UUID_RE.test(offerId)) return;
  try {
    const existing = getGuestOfferIds().filter((id) => id !== offerId);
    // Newest first, oldest dropped past the cap.
    const next = [offerId, ...existing].slice(0, MAX_TRACKED);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked (private mode). Tracking is best-effort — the server
    // falls back to claiming all of the guest's offers when no list is sent.
  }
}

export function clearGuestOffers(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
