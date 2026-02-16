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
import { OCR_MIN_CONFIDENCE } from '@/config/constants.js';

// Setup provider (should be injected or singleton, but new instance per worker process is fine)
const ocrProvider: OcrProvider = config.GOOGLE_CLOUD_CREDENTIALS
    ? new GoogleVisionOcrProvider()
    : new MockOcrProvider();

export const ocrWorker = new Worker(
    'ocr-queue',
    async (job: Job) => {
        const { offerId, storedPath, text: providedText, model } = job.data;
        console.log(`[OCR] Processing job ${job.id} for offer ${offerId}, model: ${model || 'default'}`);

        try {
            await db.update(offers).set({ status: 'PROCESSING' }).where(eq(offers.id, offerId));

            let text = '';
            let confidence = 0;

            // If text was provided directly (no file upload), skip OCR
            if (providedText) {
                console.log(`[OCR] Text provided directly, skipping OCR. Length: ${providedText.length}`);
                text = providedText;
                confidence = 1.0;
            } else if (storedPath && storedPath.endsWith('.txt')) {
                // Text file - read directly
                const fs = await import('fs/promises');
                text = await fs.readFile(storedPath, 'utf-8');
                confidence = 1.0;
                console.log(`[OCR] Read text file directly. Length: ${text.length}`);
            } else {
                // Image/PDF - use OCR provider
                const result = await ocrProvider.extractText(storedPath);
                text = result.text;
                confidence = result.confidence;
            }

            // Check confidence
            // If mock, confidence is 0.99
            if (confidence < OCR_MIN_CONFIDENCE) {
                // Mark as failed or flag for manual review?
                // Spec says: "If OCR confidence < 60% -> Mark Failed"
                await db.update(offers).set({
                    status: 'FAILED',
                    failureReason: `Low OCR confidence: ${confidence}`
                }).where(eq(offers.id, offerId));
                return;
            }

            // Update offer with text
            await db.update(offers).set({
                rawText: text,
                ocrConfidence: confidence,
                // Status remains PROCESSING until Analysis is done? 
                // Or partial completion?
                // Let's keep it PROCESSING or specific state?
                // Spec says: "Pipeline: OCR -> Analysis"
                // So we enqueue Analysis job here.
            }).where(eq(offers.id, offerId));

            // Enqueue Analysis with model parameter
            await analysisQueue.add('analyze-offer', {
                offerId,
                text,
                model: model || 'gemini-flash-latest',
            });

            console.log(`[OCR] Job ${job.id} completed. Enqueued analysis with model: ${model || 'gemini-flash-latest'}`);
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
