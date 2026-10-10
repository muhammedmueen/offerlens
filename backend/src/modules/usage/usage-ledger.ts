import { db } from '@/db/index.js';
import { usageLedger, type NewUsageLedgerRow } from '@/db/schema/usage-ledger.js';
import {
    recordSafely,
    VISION_TEXT_DETECTION_USD_PER_IMAGE,
    type BilledTo,
    type UsageContext,
    type UsageEvent,
    type UsageRecorder,
} from '@/providers/ai/usage.js';
import type { OcrProvider, OcrResult } from '@/providers/ocr/ocr.provider.js';
import { GuestService } from '@/modules/guest/guest.service.js';

/**
 * The ledger's one and only DB write.
 *
 * Append-only is enforced here by omission: there is no update or delete sibling anywhere in
 * the codebase. The default is injectable so tests can assert on rows without a database.
 */
export async function insertLedgerRow(row: NewUsageLedgerRow): Promise<void> {
    await db.insert(usageLedger).values(row);
}

/**
 * Build a recorder bound to one caller's context and billing tag.
 *
 * The provider layer reports a `UsageEvent`; this maps it to a ledger row, attaching the
 * `{ userId, guestId, offerId }` (each `?? null`) and `billedTo` that the factory bound at
 * build time. Passing `event.purpose` straight into the enum column makes tsc enforce that
 * `UsagePurpose` and the schema enum stay in step. No try/catch of its own — callers go
 * through `recordSafely` so a write failure can never break the request.
 */
export function createUsageRecorder(
    ctx: UsageContext,
    billedTo: BilledTo,
    insert: (row: NewUsageLedgerRow) => Promise<void> = insertLedgerRow,
): UsageRecorder {
    return async (event: UsageEvent) => {
        await insert({
            userId: ctx.userId ?? null,
            guestId: ctx.guestId ?? null,
            offerId: ctx.offerId ?? null,
            purpose: event.purpose,
            provider: event.provider,
            model: event.model,
            inputTokens: event.inputTokens,
            outputTokens: event.outputTokens,
            thinkingTokens: event.thinkingTokens,
            units: event.units,
            costUsd: event.costUsd,
            success: event.success,
            errorCode: event.errorCode,
            billedTo,
        });
    };
}

/**
 * Run a Vision OCR call and record exactly one ledger row for it.
 *
 * Follows the same rule as AI calls: on success `units = 1` and the list-price cost (null for
 * the mock, which has no real spend); on throw `units = 0`, cost 0 (null for mock),
 * `success = false`, `errorCode 'provider_error'`, and the original error is rethrown so the
 * caller's own failure handling is unchanged. An empty-text result is still a billed success —
 * Vision charged for the request regardless. The recorder is invoked through `recordSafely`,
 * so a ledger write failure never breaks extraction.
 */
export async function meterOcr(
    ocr: OcrProvider,
    filePath: string,
    ctx: UsageContext,
    insert: (row: NewUsageLedgerRow) => Promise<void> = insertLedgerRow,
): Promise<OcrResult> {
    const recorder = createUsageRecorder(ctx, ocr.name === 'mock' ? 'mock' : 'platform', insert);
    const base = {
        purpose: 'ocr' as const,
        provider: ocr.name,
        model: 'text-detection',
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
    };

    try {
        const result = await ocr.extractText(filePath);
        await recordSafely(recorder, {
            ...base,
            units: 1,
            costUsd: ocr.name === 'google-vision' ? VISION_TEXT_DETECTION_USD_PER_IMAGE : null,
            success: true,
            errorCode: null,
        });
        return result;
    } catch (error) {
        await recordSafely(recorder, {
            ...base,
            units: 0,
            costUsd: ocr.name === 'google-vision' ? 0 : null,
            success: false,
            errorCode: 'provider_error',
        });
        throw error;
    }
}

/**
 * Resolve the caller context for the two unauthenticated autofill routes.
 *
 * `req.userId` passes through. The guest cookie token is resolved read-only to a `guests.id`
 * via `GuestService.findByToken`; a lookup failure is caught, logged and treated as no guest.
 *
 * ponytail: a first-visit guest has no `guests` row until their first upload (the row is
 * created in `OfferService.create`), so their `/offers/extract` and `/offers/extract-file`
 * calls record `guestId: null`. Upgrade path: create the guest row on first request, or store
 * the raw cookie token on the ledger row so it can be reconciled later.
 */
export async function usageContextForRequest(
    req: { userId?: string; guestId?: string },
    guestService: GuestService = new GuestService(),
): Promise<UsageContext> {
    let guestId: string | null = null;
    if (req.guestId) {
        try {
            const guest = await guestService.findByToken(req.guestId);
            guestId = guest?.id ?? null;
        } catch (err) {
            console.error('[UsageLedger] guest context lookup failed:', (err as Error)?.message);
            guestId = null;
        }
    }
    return { userId: req.userId ?? null, guestId, offerId: null };
}
