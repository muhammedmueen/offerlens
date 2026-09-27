import { Worker, Job } from 'bullmq';
import { defaultWorkerOptions } from './worker.js';
import { db } from '@/db/index.js';
import { offers } from '@/db/schema/offers.js';
import { eq } from 'drizzle-orm';
import { OcrProvider } from '@/providers/ocr/ocr.provider.js';
import { GoogleVisionOcrProvider } from '@/providers/ocr/google-vision.ocr.js';
import { MockOcrProvider } from '@/providers/ocr/mock.ocr.js';
import { config } from '@/config/index.js';
import { analysisQueue } from '@/queue/queues.js';
import { OCR_MIN_CONFIDENCE, MIN_EXTRACTED_TEXT_CHARS } from '@/config/constants.js';

// Setup provider (should be injected or singleton, but new instance per worker process is fine)
const ocrProvider: OcrProvider = config.GOOGLE_CLOUD_CREDENTIALS
    ? new GoogleVisionOcrProvider()
    : new MockOcrProvider();

export const ocrWorker = new Worker(
    'ocr-queue',
    async (job: Job) => {
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
                // Image/PDF - use OCR provider
                const result = await ocrProvider.extractText(storedPath);
                text = result.text;
                confidence = result.confidence;
            }

            // The only genuine failure: there is nothing to analyse.
            //
            // This was previously caught by accident rather than on purpose — empty OCR output
            // arrives with confidence 0, which tripped the confidence gate below. An empty .txt
            // file had no such luck and went through to be analysed as an empty letter.
            if (text.trim().length < MIN_EXTRACTED_TEXT_CHARS) {
                console.warn(`[OCR] Only ${text.trim().length} characters extracted for offer ${offerId}`);
                await db.update(offers).set({
                    status: 'FAILED',
                    failureReason: 'We could not read any text from that file. If it is a photo, '
                        + 'try a flatter, brighter shot — or paste the text instead.',
                }).where(eq(offers.id, offerId));
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
            
            await db.update(offers).set({
                status: 'FAILED',
                failureReason: failureReason
            }).where(eq(offers.id, offerId));
            throw error;
        }
    },
    defaultWorkerOptions
);
