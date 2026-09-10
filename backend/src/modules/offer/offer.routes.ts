import { FastifyInstance } from 'fastify';
import { OfferService } from './offer.service.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { loadAuthorizedOffer } from '@/shared/access/offer-guard.js';
import { DEFAULT_GEMINI_MODEL } from '@/config/constants.js';

export async function offerRoutes(fastify: FastifyInstance) {
    const guestService = new GuestService();
    const offerService = new OfferService(fastify, guestService);

    // POST /offers — Upload an offer letter
    fastify.post('/', async (req, reply) => {
        console.log('[Offer Routes] POST /offers called');
        console.log('[Offer Routes] Content-Type:', req.headers['content-type']);
        
        // With attachFieldsToBody: true, fields are in req.body as objects with .value property
        const body = req.body as any;
        
        let file: any = null;
        let text: string | undefined = undefined;
        const fields: Record<string, any> = {};
        
        // Extract values from the field objects
        if (body) {
            for (const [key, fieldObj] of Object.entries(body)) {
                // Each field is an object with { type, fieldname, value, ... }
                const field = fieldObj as any;
                
                // Check if it's a file object
                if (field.type === 'file') {
                    console.log('[Offer Routes] Found file field');
                    file = field;
                } else if (field.type === 'field') {
                    const value = field.value;
                    console.log(`[Offer Routes] Field: ${key} = ${typeof value === 'string' ? value.substring(0, 100) : value}`);
                    
                    if (key === 'text') {
                        text = value as string;
                        console.log('[Offer Routes] ✅ Text field found, length:', text.length);
                    } else {
                        fields[key] = value;
                    }
                }
            }
        }

        console.log('[Offer Routes] Parsing complete. Summary:', {
            hasFile: !!file,
            hasText: !!text,
            textLength: text?.length,
            fieldCount: Object.keys(fields).length,
            fields: Object.keys(fields)
        });

        if (!file && !text) {
            console.log('[Offer Routes] ❌ Validation failed: no file or text');
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File or text is required', 400);
        }

        const input = {
            file: file,
            text: text,
            role: fields.role,
            experienceLevel: fields.experienceLevel,
            city: fields.city,
            currentCtc: fields.currentCtc ? Number(fields.currentCtc) : undefined,
            model: fields.model || DEFAULT_GEMINI_MODEL,
        };

        console.log('[Offer Routes] Creating offer with input:', {
            hasFile: !!input.file,
            hasText: !!input.text,
            textLength: input.text?.length,
            role: input.role,
            city: input.city,
            experienceLevel: input.experienceLevel,
            currentCtc: input.currentCtc
        });

        const result = await offerService.create(input, req.guestId!, req.ip, req.userId);

        return reply.status(201).send({
            success: true,
            data: result,
        });
    });

    // POST /offers/extract — Extract metadata from text
    fastify.post('/extract', async (req, reply) => {
        const body = req.body as { text: string };
        
        if (!body || !body.text) {
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Text is required', 400);
        }

        const result = await offerService.extractMetadataFromText(body.text);

        return reply.send({
            success: true,
            data: result,
        });
    });

    // POST /offers/extract-file — Extract text from file using OCR (fallback for scanned docs)
    fastify.post('/extract-file', async (req, reply) => {
        try {
            fastify.log.info('Extract-file endpoint called');
            
            const data = await req.file();
            
            fastify.log.info({ 
                hasFile: !!data, 
                filename: data?.filename, 
                mimetype: data?.mimetype 
            }, 'File data received');
            
            if (!data) {
                fastify.log.warn('No file found in request');
                throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File is required', 400);
            }

            fastify.log.info('Calling extractTextFromFile service');
            const result = await offerService.extractTextFromFile(data);
            
            fastify.log.info({ textLength: result.length }, 'Text extraction complete');

            return reply.send({
                success: true,
                data: { text: result },
            });
        } catch (error) {
            fastify.log.error({ error }, 'Extract-file endpoint error');
            throw error;
        }
    });

    // GET /offers/:id — Get offer by ID (owner or owning guest only)
    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };

        // Previously unauthenticated, and it returns rawText — the full offer letter.
        await loadAuthorizedOffer(id, req);

        const offer = await offerService.getById(id);

        if (!offer) {
            throw new AppError(ERROR_CODES.NOT_FOUND, 'Offer not found', 404);
        }

        return reply.send({
            success: true,
            data: offer,
        });
    });

    // DELETE /offers/:id — Delete offer (registered users only)
    fastify.delete('/:id', {
        preHandler: [requireRegistered],
        handler: async (req, reply) => {
            const { id } = req.params as { id: string };

            // requireRegistered only proves authentication. Without this, any logged-in
            // user could delete any other user's offer by ID.
            await loadAuthorizedOffer(id, req);

            await offerService.delete(id);

            return reply.send({
                success: true,
                data: { message: 'Offer deleted successfully' },
            });
        },
    });
}
