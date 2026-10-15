import { db } from '@/db/index.js';
import { usageLedger, type NewUsageLedgerRow } from '@/db/schema/usage-ledger.js';
import {
    recordSafely,
    AZURE_READ_USD_PER_PAGE,
    VISION_TEXT_DETECTION_USD_PER_IMAGE,
    type BilledTo,
    type UsageContext,
    type UsageEvent,
    type UsageRecorder,
} from '@/providers/ai/usage.js';
import type { OcrProvider, OcrResult } from '@/providers/ocr/ocr.provider.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { config } from '@/config/index.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

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
    // Honest OCR in production. This is the one function both OCR callers reach — the
    // /offers/extract-file route (via OfferService.extractTextFromFile) and the OCR worker's
    // image branch — so the guard lives here once rather than at each caller. In production the
    // mock provider would hand back canned text and a fabricated analysis, so refuse the image/
    // scanned-document OCR request with a clear 4xx. Development and test are untouched: the mock
    // is the expected local provider. Pasted text and text-layer PDFs never call meterOcr.
    if (config.NODE_ENV === 'production' && ocr.name === 'mock') {
        throw new AppError(
            ERROR_CODES.OCR_UNAVAILABLE,
            'Image uploads are not available on this deployment. Paste the text or upload a PDF with selectable text.',
            400,
        );
    }

    const recorder = createUsageRecorder(ctx, ocr.name === 'mock' ? 'mock' : 'platform', insert);
    const base = {
        purpose: 'ocr' as const,
        provider: ocr.name,
        // Model string per provider so the ledger names what actually ran, not Vision's endpoint.
        model: ocr.name === 'azure-doc-intelligence' ? 'prebuilt-read' : 'text-detection',
        inputTokens: 0,
        outputTokens: 0,
        thinkingTokens: 0,
    };

    try {
        const result = await ocr.extractText(filePath);
        // Billing unit differs by provider. Vision bills per image (one unit); Azure Read bills
        // per PAGE, so a multi-page scan is `pages` units at the per-page rate; the mock has no
        // real spend. `null` cost, never a fabricated number, when the provider has no price.
        //
        // ponytail: `result.pages` is the page count the provider reported; when a provider does
        // not report one (missing field, older response shape) we fall back to one unit. That
        // slightly under-counts a multi-page scan with an absent page count — upgrade path is to
        // reconcile against the Azure Cost Management export rather than trusting this field.
        let units = 1;
        let costUsd: number | null = null;
        if (ocr.name === 'google-vision') {
            costUsd = VISION_TEXT_DETECTION_USD_PER_IMAGE;
        } else if (ocr.name === 'azure-doc-intelligence') {
            units = result.pages && result.pages > 0 ? result.pages : 1;
            costUsd = Number((units * AZURE_READ_USD_PER_PAGE).toFixed(6));
        }
        await recordSafely(recorder, {
            ...base,
            units,
            costUsd,
            success: true,
            errorCode: null,
        });
        return result;
    } catch (error) {
        await recordSafely(recorder, {
            ...base,
            units: 0,
            costUsd: ocr.name === 'mock' ? null : 0,
            success: false,
            errorCode: 'provider_error',
        });
        throw error;
    }
}

/**
 * Resolve the caller context for the two unauthenticated autofill routes.
 *
 * `req.userId` passes through, and for a signed-in caller the guest cookie is resolved
 * read-only (`findByToken`). For a guest, first use of a metered route creates their `guests`
 * row (`getOrCreateGuest`, one upsert), so a first-visit guest's ledger row and autofill cap
 * are attributed to a real `guests.id` instead of null. A lookup failure is caught, logged and
 * treated as no guest.
 */
export async function usageContextForRequest(
    req: { userId?: string; guestId?: string; ip: string },
    guestService: Pick<GuestService, 'findByToken' | 'getOrCreateGuest'> = new GuestService(),
): Promise<UsageContext> {
    let guestId: string | null = null;
    if (req.guestId) {
        try {
            const guest = req.userId
                ? await guestService.findByToken(req.guestId)
                : await guestService.getOrCreateGuest({ fingerprint: req.guestId, ip: req.ip });
            guestId = guest?.id ?? null;
        } catch (err) {
            console.error('[UsageLedger] guest context lookup failed:', (err as Error)?.message);
            guestId = null;
        }
    }
    return { userId: req.userId ?? null, guestId, offerId: null };
}
