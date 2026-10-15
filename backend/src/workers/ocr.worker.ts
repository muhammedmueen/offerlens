import { Worker, Job } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { eq } from 'drizzle-orm';
import { OcrProvider } from '@/providers/ocr/ocr.provider.js';
import { createOcrProvider } from '@/providers/ocr/ocr.factory.js';
import { analysisQueue } from '@/queue/queues.js';
import { OCR_MIN_CONFIDENCE, MIN_EXTRACTED_TEXT_CHARS } from '@/config/constants.js';
import { extractPdfText } from '@/providers/pdf/pdf-text.js';
import { meterOcr } from '@/modules/usage/usage-ledger.js';
import { failOfferAndRefund } from '@/modules/quota/quota.service.js';
import { isFinalAttempt } from './attempts.js';
import { runThenPurgeFile } from './stored-file.js';

// One factory, shared with plugins/providers.ts, selects the provider from OCR_PROVIDER + creds.
// A new instance per worker process is fine (the SDK clients hold no connection state).
const ocrProvider: OcrProvider = createOcrProvider();

/**
 * Mark an offer failed with a message written for the person who uploaded it.
 *
 * `ProcessingPage` prints an unrecognised `failureReason` verbatim, so these are sentences rather
 * than diagnostics — and each one says what to try next, because the alternative is a dead end.
 */
async function failOffer(offerId: string, reason: string): Promise<void> {
    // Every caller returns without throwing, so this failure is terminal: refund the
    // analysis quota in the same transaction (task 4.3).
    await failOfferAndRefund(offerId, reason);
}

async function processOcr(job: Job) {
        const { offerId, storedPath, text: providedText, model, aiSelection } = job.data;
        console.log(`[OCR] Processing job ${job.id} for offer ${offerId}, model: ${model || 'default'}`);

        try {
            await db.update(offers).set({ status: 'PROCESSING' }).where(eq(offers.id, offerId));

            let text = '';

            // Null, not 1.0, on the two paths where no recognition happens (task 21d). Writing
            // 1.0 for typed text was a lie with a visible symptom: `assessConfidence` keys off
            // "was this recognised", and a first pass read non-null as "yes" and downgraded every
            // field on a pasted letter. It still tolerates the legacy 1.0 rows already stored.
            let confidence: number | null = null;

            // If text was provided directly (no file upload), skip OCR
            if (providedText) {
                console.log(`[OCR] Text provided directly, skipping OCR. Length: ${providedText.length}`);
                text = providedText;
            } else if (storedPath && storedPath.endsWith('.txt')) {
                // Text file - read directly
                const fs = await import('fs/promises');
                text = await fs.readFile(storedPath, 'utf-8');
                console.log(`[OCR] Read text file directly. Length: ${text.length}`);
            } else {
                // A PDF's own text layer first (task 21c part A). Cheaper, faster and more
                // accurate than OCR when it exists, which for a software-generated offer letter
                // it usually does. Returns `not-pdf` for images, which fall through to OCR.
                const pdf = await extractPdfText(storedPath);

                if (pdf.kind === 'encrypted') {
                    await failOffer(offerId, 'That PDF is password-protected, so we cannot open '
                        + 'it. Remove the password and upload again, or paste the text instead.');
                    return;
                }

                if (pdf.kind === 'no-text-layer') {
                    // A scan or a photograph saved as a PDF. It needs OCR, and OCR cannot take a
                    // PDF: `textDetection` is an image endpoint, so calling it here would fail on
                    // format grounds no matter what the credentials are. Failing with the real
                    // diagnosis beats spending a request to be told something less useful.
                    //
                    // Task 21c part B replaces this branch with `files:annotate`, which does accept
                    // PDF content inline — up to 5 pages, no GCS bucket needed. Blocked on billing.
                    console.warn(`[OCR] PDF for offer ${offerId} has no text layer (${pdf.pages} page(s))`);
                    await failOffer(offerId, 'That PDF looks like a scan or a photo, and we cannot '
                        + 'read text from scans yet. Paste the letter\'s text instead, or upload it '
                        + 'as a PNG or JPEG.');
                    return;
                }

                if (pdf.kind === 'unreadable') {
                    console.error(`[OCR] Unreadable PDF for offer ${offerId}: ${pdf.reason}`);
                    await failOffer(offerId, 'We could not open that PDF. It may be damaged — try '
                        + 'saving a fresh copy, or paste the text instead.');
                    return;
                }

                if (pdf.kind === 'text') {
                    text = pdf.text;
                    // Stays null: this text was READ, not recognised. Setting a number here would
                    // make task 11 downgrade every field as though it came off a camera.
                    confidence = null;
                    console.log(`[OCR] Read the PDF text layer directly — ${pdf.pages} page(s), ${text.length} chars, no OCR needed`);
                } else {
                    // `not-pdf` — an image. This is the path OCR is actually for, and the
                    // only one that makes a billable Vision call, so it is the only one metered.
                    const owner = await db.query.offers.findFirst({
                        where: eq(offers.id, offerId),
                        columns: { userId: true, guestId: true },
                    }).catch((err) => {
                        console.error('[OCR] usage context lookup failed', (err as Error)?.message);
                        return undefined;
                    });

                    const result = await meterOcr(ocrProvider, storedPath, {
                        userId: owner?.userId ?? null,
                        guestId: owner?.guestId ?? null,
                        offerId,
                    });
                    text = result.text;
                    confidence = result.confidence;
                }
            }

            // The only genuine failure: there is nothing to analyse.
            //
            // This was previously caught by accident rather than on purpose — empty OCR output
            // arrives with confidence 0, which tripped the confidence gate below. An empty .txt
            // file had no such luck and went through to be analysed as an empty letter.
            if (text.trim().length < MIN_EXTRACTED_TEXT_CHARS) {
                console.warn(`[OCR] Only ${text.trim().length} characters extracted for offer ${offerId}`);
                await failOffer(offerId, 'We could not read any text from that file. If it is a '
                    + 'photo, try a flatter, brighter shot — or paste the text instead.');
                return;
            }

            // Low confidence WARNS, it no longer rejects.
            //
            // The old behaviour was `status = FAILED, failureReason = "Low OCR confidence: 0.55"`,
            // which is the wrong trade: a slightly blurry photo still yields a mostly-correct
            // letter, and task 11's confidence machinery already downgrades every field read from
            // a page and shows the user a caveat. An analysis with a warning beats a dead end that
            // offers no result and no recourse.
            if (confidence !== null && confidence < OCR_MIN_CONFIDENCE) {
                console.warn(
                    `[OCR] Low confidence ${confidence.toFixed(2)} for offer ${offerId} — `
                    + 'analysing anyway, fields will be marked uncertain',
                );
            }

            // Update offer with text. Status stays PROCESSING; the analysis job set below moves
            // it to COMPLETED or FAILED.
            await db.update(offers).set({
                rawText: text,
                ocrConfidence: confidence,
            }).where(eq(offers.id, offerId));

            // Enqueue Analysis with model parameter
            await analysisQueue.add('analyze-offer', {
                offerId,
                // Forwarded as-is, including undefined. Defaulting to DEFAULT_GEMINI_MODEL
                // here meant this worker decided the model for a provider it knows nothing
                // about — the analysis worker may run OpenAI or Anthropic.
                text,
                model,
                // Forwarded, not re-derived: there is no request here, so the selection can
                // only come from the job that queued this one.
                aiSelection: aiSelection ?? {},
            });

            console.log(`[OCR] Job ${job.id} completed. Enqueued analysis with model: ${model || 'provider default'}`);
        } catch (error: any) {
            console.error(`[OCR] Job ${job.id} failed:`, error);
            
            // Detect rate limit errors
            let failureReason = error.message || 'OCR extraction failed';
            
            if (error.message?.includes('429') || error.message?.includes('rate limit') || error.message?.includes('quota')) {
                failureReason = 'RATE_LIMIT: API rate limit exceeded during text extraction. Please wait a few minutes and try again.';
                console.error(`[OCR] Rate limit hit for offer ${offerId}`);
            }
            
            // Only the last attempt is terminal and refunds. Earlier attempts keep today's
            // per-attempt FAILED write; BullMQ will retry and may still succeed.
            if (isFinalAttempt(job)) {
                await failOfferAndRefund(offerId, failureReason);
            } else {
                await db.update(offers).set({
                    status: 'FAILED',
                    failureReason: failureReason
                }).where(eq(offers.id, offerId));
            }
            throw error;
        }
}

// The uploaded file is deleted once extraction is over, success or failure (task 4.5).
//
// lockDuration (120s) is set HERE, not in defaultWorkerOptions, on purpose: only the OCR job
// now blocks on an async Azure analyze LRO (polled, bounded to 110s in the provider), which can
// exceed BullMQ's 30s default lock and get re-queued mid-flight. The analysis worker has no such
// long synchronous wait, so widening the shared default would loosen its lock for no reason.
// Concurrency and the rest of the options are inherited unchanged.
export const ocrWorker = new Worker(
    'ocr-queue',
    (job: Job) => runThenPurgeFile(job, job.data.storedPath, () => processOcr(job)),
    { ...defaultWorkerOptions, lockDuration: 120_000 }
);
