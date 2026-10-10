import { db } from '@/db/index.js';
import { offers, NewOffer } from '@/db/schema/offers.js';
import { offerFiles, NewOfferFile } from '@/db/schema/offer-files.js';
import { eq, and } from 'drizzle-orm';
import { FastifyInstance } from 'fastify';
import { CreateOfferInput, OfferResponse } from './offer.types.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { ocrQueue } from '@/queue/queues.js';
import crypto from 'crypto';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { randomUUID } from 'node:crypto';
import { sanitizeFilename } from '@/shared/sanitize.js';
import { createAiProvider, type AiProviderSelection } from '@/providers/ai/ai.factory.js';
import { redactSelection } from '@/providers/ai/request-override.js';
import { meterOcr } from '@/modules/usage/usage-ledger.js';
import type { UsageContext } from '@/providers/ai/usage.js';
import { resolveDedupScope } from './offer.dedup.js';
import os from 'node:os';
import path from 'node:path';

/**
 * Build a scratch path for an uploaded file.
 *
 * Two problems with the previous ``temp-${uuid}-${file.filename}``: the filename came
 * straight from the multipart request, so `../../evil.txt` escaped the directory, and it
 * was relative — writing scratch files into the process working directory, which is the
 * repo in development and may be read-only in a container.
 */
function buildTempPath(originalName: string): string {
    return path.join(os.tmpdir(), `offerlens-${randomUUID()}-${sanitizeFilename(originalName)}`);
}

export class OfferService {
    constructor(
        private fastify: FastifyInstance,
        private guestService: GuestService
    ) { }

    async create(input: CreateOfferInput, guestId: string, ip: string, userId?: string): Promise<OfferResponse> {
        // 1. Guest Check & Rate Limit
        const guest = await this.guestService.getOrCreateGuest({ fingerprint: guestId, ip });

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

        // 3. Duplicate Check — scoped to the caller (ADR-001).
        //
        // This lookup used to be global, against a globally-unique text_hash. Two people
        // uploading identical text collided: the second was handed the first's offer ID,
        // and when that offer had FAILED the delete below removed someone else's row.
        const ownerScope = resolveDedupScope(userId, guest.id);
        const existingOffer = await db.query.offers.findFirst({
            where: and(
                eq(offers.textHash, hash),
                ownerScope.kind === 'user'
                    ? eq(offers.userId, ownerScope.id)
                    : eq(offers.guestId, ownerScope.id),
            ),
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
            // Safe now: the query above guarantees this offer belongs to the caller.
            await db.delete(offers).where(eq(offers.id, existingOffer.id));
        }

        // 4. Create Database Records (Transaction)
        const offerId = randomUUID();

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
        });

        // 5. Enqueue Job
        if (input.text) {
            // Skip OCR, go straight to analysis
            console.log('[Offer Service] Adding job to OCR queue (process-text):', { offerId, textLength: input.text.length, model: input.model });
            await ocrQueue.add('process-text', {
                offerId,
                text: input.text,
                // Left undefined when the caller named no model, so whichever provider runs
                // resolves its own per-task default. This used to default to
                // DEFAULT_GEMINI_MODEL here, which undid the same fix already made in
                // offer.routes.ts and put a Gemini id in every job regardless of provider.
                model: input.model,
                // Carried to the worker so a development provider override survives the
                // queue hop. The analysis worker redacts any key from the stored payload
                // once the job finishes — see analysis.worker.ts.
                aiSelection: input.aiSelection ?? {},
            });
            console.log('[Offer Service] ✅ Job added to queue successfully');
        } else {
            // Need OCR first
            console.log('[Offer Service] Adding job to OCR queue (process-ocr):', { offerId, storedPath, model: input.model });
            await ocrQueue.add('process-ocr', {
                offerId,
                storedPath,
                model: input.model,
                aiSelection: input.aiSelection ?? {},
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

    /**
     * Step 2 of autofill: offer text in, structured fields out.
     *
     * `POST /offers/extract-file` returns text and nothing else, so the frontend calls
     * `POST /offers/extract` with that text. There used to be a third method,
     * `extractMetadata(file)`, that did both halves in one pass — it had no caller anywhere
     * in the codebase and has been deleted. It also held the only copy of a comment
     * describing a `NODE_ENV === 'production'` gating fix, so the fix was documented on the
     * dead path while the live one gated on credentials all along.
     */
    async extractMetadataFromText(
        text: string,
        selection: AiProviderSelection = {},
        usage: UsageContext = {},
    ): Promise<any> {
        // Default `{}` still meters, just without attribution. Routes pass the request's
        // identity via `usageContextForRequest`.
        const aiProvider = createAiProvider(selection, usage);

        this.fastify.log.info(
            { provider: aiProvider.constructor.name, selection: redactSelection(selection) },
            'Using AI provider for metadata extraction',
        );

        return aiProvider.extractMetadata(text);
    }

    /** Step 1 of autofill: uploaded file in, plain text out. */
    async extractTextFromFile(
        file: { toBuffer: () => Promise<Buffer>, filename: string, mimetype: string },
        usage: UsageContext = {},
    ): Promise<string> {
        this.fastify.log.info({ filename: file.filename, mimetype: file.mimetype }, 'Starting text extraction from file');

        // The instance the providers plugin already built, not a fresh one. This used to
        // re-run the same `GOOGLE_CLOUD_CREDENTIALS` check and construct a new
        // GoogleVisionOcrProvider on every request — a second gRPC client and another read
        // of the credentials file, per call, on a route reachable without an account.
        const ocrProvider = this.fastify.ocr;

        this.fastify.log.info({ provider: ocrProvider.constructor.name }, 'Using OCR provider');

        const buffer = await file.toBuffer();
        this.fastify.log.info({ bufferSize: buffer.length }, 'File buffer loaded');
        
        const tempPath = buildTempPath(file.filename);
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
                // meterOcr records one 'ocr' ledger row for the Vision call, then returns the
                // same OcrResult. A ledger failure never breaks extraction.
                const ocrResult = await meterOcr(ocrProvider, tempPath, usage);
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
