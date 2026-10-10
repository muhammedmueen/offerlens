import { FastifyInstance } from 'fastify';
import { OfferService } from './offer.service.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { requireRegistered } from '@/middleware/authenticate.js';
import { loadAuthorizedOffer } from '@/shared/access/offer-guard.js';
import { routeLimit } from '@/middleware/rate-limiter.js';
import { MAX_EXTRACT_TEXT_CHARS } from '@/config/constants.js';
import { readUploadedFile } from './multipart.js';
import { usageContextForRequest } from '@/modules/usage/usage-ledger.js';

export async function offerRoutes(fastify: FastifyInstance) {
    const guestService = new GuestService();
    const offerService = new OfferService(fastify, guestService);

    // POST /offers — Upload an offer letter
    fastify.post('/', async (req, reply) => {
        console.log('[Offer Routes] POST /offers called');
        console.log('[Offer Routes] Content-Type:', req.headers['content-type']);
        
        // With attachFieldsToBody: true, fields are in req.body as objects with .value property
        const body = req.body as any;

        // Same reader as /extract-file, which also gets the file its type validated against
        // SUPPORTED_FILE_TYPES — a list that until now was declared and used by nothing.
        const file = readUploadedFile(body);
        let text: string | undefined = undefined;
        const fields: Record<string, any> = {};

        // Extract values from the field objects
        if (body) {
            for (const [key, fieldObj] of Object.entries(body)) {
                // Each field is an object with { type, fieldname, value, ... }
                const field = fieldObj as any;

                if (field.type === 'field') {
                    const value = field.value;

                    if (key === 'text') {
                        text = value as string;
                        // Length only. This used to log the first 100 characters of every
                        // field, which for `text` is the opening lines of someone's offer
                        // letter — name, employer and salary — written to stdout.
                        console.log('[Offer Routes] Text field found, length:', text.length);
                    } else {
                        fields[key] = value;
                        console.log(`[Offer Routes] Field: ${key} = ${typeof value === 'string' ? value.substring(0, 100) : value}`);
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
            // `?? undefined` because CreateOfferInput.file is optional, not nullable. The old
            // `let file: any = null` hid the mismatch; typing the reader surfaced it.
            file: file ?? undefined,
            text: text,
            role: fields.role,
            experienceLevel: fields.experienceLevel,
            city: fields.city,
            currentCtc: fields.currentCtc ? Number(fields.currentCtc) : undefined,
            // Left undefined rather than defaulted to DEFAULT_GEMINI_MODEL, which is what it
            // used to do. Now that a request can select OpenAI or Anthropic, baking a Gemini
            // model id into every job would hand "gemini-2.5-flash" to whichever provider
            // ran — a 404 from the vendor, for a reason nothing in the log would explain.
            // Each provider resolves its own default.
            model: fields.model || undefined,
            aiSelection: req.aiSelection,
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
    //
    // Calls Gemini, and is deliberately reachable without an account because the upload
    // form pre-fills role/city from the pasted text before signup. That makes it a cost
    // vector, so it carries its own tight limit rather than relying on the 100/min global.
    fastify.post('/extract', {
        ...routeLimit('offerExtractText'),
        handler: async (req, reply) => {
            const body = req.body as { text?: unknown };

            if (typeof body?.text !== 'string' || body.text.trim().length === 0) {
                throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'Text is required', 400);
            }

            // Cap the payload: the whole string goes into a Gemini prompt, and cost scales
            // with input length. The provider truncates to 10k internally; reject clearly
            // rather than silently analysing a fraction of a huge paste.
            if (body.text.length > MAX_EXTRACT_TEXT_CHARS) {
                throw new AppError(
                    ERROR_CODES.VALIDATION_ERROR,
                    `Text is too long (${body.text.length} characters, limit ${MAX_EXTRACT_TEXT_CHARS})`,
                    400,
                );
            }

            const usage = await usageContextForRequest(req);
            const result = await offerService.extractMetadataFromText(body.text, req.aiSelection, usage);

            return reply.send({
                success: true,
                data: result,
            });
        },
    });

    // POST /offers/extract-file — Extract text from file using OCR (fallback for scanned docs)
    //
    // Calls Cloud Vision, which is billed per page. Same reasoning as /extract: needed
    // pre-signup, so it gets a tighter limit instead of an auth requirement (C2).
    fastify.post('/extract-file', {
        ...routeLimit('offerExtractFile'),
        handler: async (req, reply) => {
            try {
                // Read from req.body, not req.file(). The multipart plugin runs with
                // attachFieldsToBody, so the stream is already drained by the time a handler
                // runs and req.file() always returned undefined — this route answered
                // "File is required" to every upload ever sent to it.
                const data = readUploadedFile(req.body);

                fastify.log.info({
                    hasFile: !!data,
                    filename: data?.filename,
                    mimetype: data?.mimetype,
                }, 'Extract-file request received');

                if (!data) {
                    throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File is required', 400);
                }

                const usage = await usageContextForRequest(req);
                const result = await offerService.extractTextFromFile(data, usage);
                fastify.log.info({ textLength: result.length }, 'Text extraction complete');

                return reply.send({
                    success: true,
                    data: { text: result },
                });
            } catch (error) {
                fastify.log.error({ error }, 'Extract-file endpoint error');
                throw error;
            }
        },
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
