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

        // 2. File Validation & Hashing
        const fileBuffer = await input.file.toBuffer();
        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // 3. Duplicate Check
        const existingOffer = await db.query.offers.findFirst({
            where: eq(offers.textHash, hash),
            // We might want to allow re-upload if previous failed or explicit retry?
            // For now, simple dedup: if exists return it? Or error?
            // Let's check status. If FAILED, allow retry (maybe delete old?). 
            // If PROCESSING/COMPLETED, return existing ID?
            // Spec says: "If exact duplicate hash found -> return existing analysis ID"
        });

        if (existingOffer) {
            // If existing offer belongs to user, return it
            // If it belongs to guest, and now we are user, we might want to "claim" it?
            // For now, simple return.
            return {
                id: existingOffer.id,
                status: existingOffer.status,
                createdAt: existingOffer.createdAt,
                isGuest: existingOffer.isGuest,
                // estimatedProcessingTime: 0 // Completed
            };
        }

        // 4. Upload File
        // We use storage provider
        const storedPath = await this.fastify.storage.upload(fileBuffer, input.file.filename);

        // 5. Create Database Records (Transaction)
        const offerId = uuidv4();

        const newOffer: NewOffer = {
            id: offerId,
            guestId: guest.id,
            userId: userId, // Link to user
            textHash: hash,
            status: 'QUEUED',
            isGuest: !userId, // False if user
            userContext: {
                role: input.role,
                experienceYears: input.experienceYears,
                city: input.city,
                expectedCTC: input.expectedCTC,
                currency: input.currency,
            },
            expiresAt: userId ? undefined : new Date(Date.now() + 24 * 60 * 60 * 1000), // Users: no expiry (or long), Guests: 24h
        };

        const newFile: NewOfferFile = {
            offerId: offerId,
            originalName: input.file.filename,
            storedPath: storedPath,
            mimeType: input.file.mimetype,
            fileSizeBytes: fileBuffer.length,
        };

        await db.transaction(async (tx) => {
            await tx.insert(offers).values(newOffer);
            await tx.insert(offerFiles).values(newFile);

            // Initial analysis record? Or create later in worker?
            // Better to create partial record later or now?
            // Let's create offer record only. Analysis record created when results ready or processing starts.

            // Increment guest usage (still track even for users)
            await this.guestService.incrementAnalysisCount(guest.id);
        });

        // 6. Enqueue Job
        await ocrQueue.add('process-ocr', {
            offerId,
            storedPath, // Workers need access to storage. If local, sharing volume/path works.
            // In distributed, storedPath must be accessible (S3 URL etc). Local is file path.
        });

        return {
            id: offerId,
            status: 'QUEUED',
            createdAt: new Date(),
            isGuest: !userId,
            estimatedProcessingTime: 30, // seconds estimated
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
        };
    }
    async update(id: string, data: Partial<NewOffer>): Promise<void> {
        await db.update(offers)
            .set(data)
            .where(eq(offers.id, id));
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
