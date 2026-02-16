import { db } from '@/db/index.js';
import { offers, NewOffer } from '@/db/schema/offers.js';
import { offerFiles, NewOfferFile } from '@/db/schema/offer-files.js';
import { analyses } from '@/db/schema/analyses.js';
import { eq } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { CreateOfferInput, OfferResponse } from './offer.types.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { ocrQueue } from '@/queue/queues.js';
import crypto from 'crypto';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { v4 as uuidv4 } from 'uuid';
import { GoogleVisionOcrProvider } from '@/providers/ocr/google-vision.ocr.js';
import { MockOcrProvider } from '@/providers/ocr/mock.ocr.js';
import { GeminiAiProvider } from '@/providers/ai/gemini.ai.js';
import { MockAiProvider } from '@/providers/ai/mock.ai.js';
import { config } from '@/config/index.js';

export class OfferService {
    constructor(
        private fastify: FastifyInstance,
        private guestService: GuestService
    ) { }

    async create(input: CreateOfferInput, guestId: string, ip: string, userId?: string): Promise<OfferResponse> {
        // 1. Guest Check & Rate Limit
        const guest = await this.guestService.getOrCreateGuest({ fingerprint: guestId, ip });

        // Check limits (only for guests)
        if (!userId) {
            await this.guestService.checkLimits(guest.id);
        }

        // 2. Get text content and hash
        let textContent: string;
        let hash: string;
        let storedPath: string | null = null;
        let fileInfo: { filename: string; mimetype: string; size: number } | null = null;

        if (input.text) {
            // Text provided directly
            textContent = input.text;
            hash = crypto.createHash('sha256').update(textContent).digest('hex');
        } else if (input.file) {
            // File provided - extract text via OCR
            const fileBuffer = await input.file.toBuffer();
            hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
            
            // Store file
            storedPath = await this.fastify.storage.upload(fileBuffer, input.file.filename);
            fileInfo = {
                filename: input.file.filename,
                mimetype: input.file.mimetype,
                size: fileBuffer.length,
            };
            
            // Extract text (will be done by worker, but we need placeholder)
            textContent = ''; // Will be filled by OCR worker
        } else {
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File or text is required', 400);
        }

        // 3. Duplicate Check (exclude failed offers to allow retries)
        const existingOffer = await db.query.offers.findFirst({
            where: eq(offers.textHash, hash),
        });

        if (existingOffer && existingOffer.status !== 'FAILED') {
            console.log('[Offer Service] Found existing offer:', existingOffer.id, 'status:', existingOffer.status);
            return {
                id: existingOffer.id,
                status: existingOffer.status,
                createdAt: existingOffer.createdAt,
                isGuest: existingOffer.isGuest,
            };
        }
        
        if (existingOffer && existingOffer.status === 'FAILED') {
            console.log('[Offer Service] Found failed offer, deleting it to allow retry');
            // Delete the failed offer to allow creating a new one with the same text_hash
            await db.delete(offers).where(eq(offers.id, existingOffer.id));
        }

        // 4. Create Database Records (Transaction)
        const offerId = uuidv4();

        const newOffer: NewOffer = {
            id: offerId,
            guestId: guest.id,
            userId: userId,
            textHash: hash,
            status: input.text ? 'QUEUED' : 'QUEUED', // Both go to queue
            isGuest: !userId,
            rawText: input.text || null, // Store text immediately if provided
            userContext: {
                role: input.role,
                experienceLevel: input.experienceLevel,
                city: input.city,
                currentCtc: input.currentCtc,
            },
            expiresAt: userId ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000),
        };

        await db.transaction(async (tx) => {
            await tx.insert(offers).values(newOffer);
            
            if (fileInfo && storedPath) {
                const newFile: NewOfferFile = {
                    offerId: offerId,
                    originalName: fileInfo.filename,
                    storedPath: storedPath,
                    mimeType: fileInfo.mimetype,
                    fileSizeBytes: fileInfo.size,
                };
                await tx.insert(offerFiles).values(newFile);
            }

            await this.guestService.incrementAnalysisCount(guest.id);
        });

        // 5. Enqueue Job
        if (input.text) {
            // Skip OCR, go straight to analysis
            console.log('[Offer Service] Adding job to OCR queue (process-text):', { offerId, textLength: input.text.length, model: input.model });
            await ocrQueue.add('process-text', {
                offerId,
                text: input.text,
                model: input.model || 'gemini-flash-latest',
            });
            console.log('[Offer Service] ✅ Job added to queue successfully');
        } else {
            // Need OCR first
            console.log('[Offer Service] Adding job to OCR queue (process-ocr):', { offerId, storedPath, model: input.model });
            await ocrQueue.add('process-ocr', {
                offerId,
                storedPath,
                model: input.model || 'gemini-flash-latest',
            });
            console.log('[Offer Service] ✅ Job added to queue successfully');
        }

        return {
            id: offerId,
            status: 'QUEUED',
            createdAt: new Date(),
            isGuest: !userId,
            estimatedProcessingTime: 30,
        };
    }

    async getById(id: string): Promise<OfferResponse | null> {
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, id),
        });

        if (!offer) return null;

        return {
            id: offer.id,
            status: offer.status,
            createdAt: offer.createdAt,
            expiresAt: offer.expiresAt,
            isGuest: offer.isGuest,
            rawText: offer.rawText,
            failureReason: offer.failureReason,
        };
    }
    async update(id: string, data: Partial<NewOffer>): Promise<void> {
        await db.update(offers)
            .set(data)
            .where(eq(offers.id, id));
    }

    async extractMetadataFromText(text: string): Promise<any> {
        const aiProvider = config.GEMINI_API_KEY
            ? new GeminiAiProvider()
            : new MockAiProvider();

        this.fastify.log.info({ provider: aiProvider.constructor.name }, 'Using AI provider for metadata extraction');

        const metadata = await aiProvider.extractMetadata(text);
        return metadata;
    }

    async extractTextFromFile(file: { toBuffer: () => Promise<Buffer>, filename: string, mimetype: string }): Promise<string> {
        this.fastify.log.info({ filename: file.filename, mimetype: file.mimetype }, 'Starting text extraction from file');
        
        const ocrProvider = config.GOOGLE_CLOUD_CREDENTIALS
            ? new GoogleVisionOcrProvider()
            : new MockOcrProvider();

        this.fastify.log.info({ provider: ocrProvider.constructor.name }, 'Using OCR provider');

        const buffer = await file.toBuffer();
        this.fastify.log.info({ bufferSize: buffer.length }, 'File buffer loaded');
        
        const tempPath = `temp-${uuidv4()}-${file.filename}`;
        this.fastify.log.info({ tempPath }, 'Writing temp file');

        const fs = await import('fs/promises');
        await fs.writeFile(tempPath, buffer);

        try {
            let text = '';
            if (file.filename.endsWith('.txt')) {
                this.fastify.log.info('Reading as text file');
                text = await fs.readFile(tempPath, 'utf-8');
            } else {
                this.fastify.log.info('Calling OCR provider');
                const ocrResult = await ocrProvider.extractText(tempPath);
                text = ocrResult.text;
                this.fastify.log.info({ textLength: text.length, confidence: ocrResult.confidence }, 'OCR complete');
            }
            return text;
        } finally {
            this.fastify.log.info('Cleaning up temp file');
            await fs.unlink(tempPath).catch((err) => {
                this.fastify.log.warn({ error: err }, 'Failed to delete temp file');
            });
        }
    }

    async extractMetadata(file: { toBuffer: () => Promise<Buffer>, filename: string, mimetype: string }): Promise<any> {
        // Instantiate providers (lazy or singleton)
        // For now, new instance is fine or static
        const ocrProvider = config.GOOGLE_CLOUD_CREDENTIALS && config.NODE_ENV === 'production'
            ? new GoogleVisionOcrProvider()
            : new MockOcrProvider();

        const aiProvider = config.GEMINI_API_KEY && config.NODE_ENV === 'production'
            ? new GeminiAiProvider()
            : new MockAiProvider();

        // 1. Save temp file for OCR (some providers need path) or use buffer if supported
        // Google Vision needs path or buffer. Our OcrProvider interface takes path currently?
        // Let's check OcrProvider interface.
        // Assuming it takes path. We need to save file temporarily.
        const buffer = await file.toBuffer();
        const tempPath = `temp-${uuidv4()}-${file.filename}`;

        // This is a bit hacky for temp file. Better: rely on storage provider or fs.
        // Let's use fs to write temp file
        const fs = await import('fs/promises');
        await fs.writeFile(tempPath, buffer);

        try {
            // 2. OCR
            let text = '';
            if (file.filename.endsWith('.txt')) {
                text = await fs.readFile(tempPath, 'utf-8');
            } else {
                const ocrResult = await ocrProvider.extractText(tempPath);
                text = ocrResult.text;
            }

            // 3. AI Extraction
            const metadata = await aiProvider.extractMetadata(text);
            return metadata;
        } finally {
            // Cleanup
            await fs.unlink(tempPath).catch(() => { });
        }
    }

    async delete(id: string): Promise<void> {
        // 1. Verify offer exists
        const offer = await db.query.offers.findFirst({
            where: eq(offers.id, id),
        });

        if (!offer) {
            throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        }

        // 2. Get associated files for storage cleanup
        const files = await db.query.offerFiles.findMany({
            where: eq(offerFiles.offerId, id),
        });

        // 3. Delete stored files (graceful — ignore missing)
        for (const file of files) {
            try {
                await this.fastify.storage.delete(file.storedPath);
            } catch {
                // Log but don't fail if file already gone
                this.fastify.log.warn({ path: file.storedPath }, 'File not found during offer deletion');
            }
        }

        // 4. Delete offer record (cascades to offer_files + analyses)
        await db.delete(offers).where(eq(offers.id, id));
    }
}
