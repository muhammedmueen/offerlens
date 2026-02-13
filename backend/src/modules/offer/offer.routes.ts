import { FastifyInstance } from 'fastify';
import { OfferService } from './offer.service.js';
import { GuestService } from '@/modules/guest/guest.service.js';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { requireRegistered } from '@/middleware/authenticate.js';

export async function offerRoutes(fastify: FastifyInstance) {
    const guestService = new GuestService();
    const offerService = new OfferService(fastify, guestService);

    // POST /offers — Upload an offer letter
    fastify.post('/', async (req, reply) => {
        const data = await req.file();
        if (!data) {
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File is required', 400);
        }

        const fields = data.fields as Record<string, any>;
        const input = {
            file: data,
            role: fields.role?.value,
            experienceYears: fields.experienceYears?.value ? Number(fields.experienceYears.value) : undefined,
            city: fields.city?.value,
            expectedCTC: fields.expectedCTC?.value ? Number(fields.expectedCTC.value) : undefined,
            currency: fields.currency?.value,
        };

        const result = await offerService.create(input, req.guestId!, req.ip, req.userId);

        return reply.status(201).send({
            success: true,
            data: result,
        });
    });

    // POST /offers/extract — Extract metadata from file
    fastify.post('/extract', async (req, reply) => {
        const data = await req.file();
        if (!data) {
            throw new AppError(ERROR_CODES.VALIDATION_ERROR, 'File is required', 400);
        }

        const result = await offerService.extractMetadata(data);

        return reply.send({
            success: true,
            data: result,
        });
    });

    // GET /offers/:id — Get offer by ID
    fastify.get('/:id', async (req, reply) => {
        const { id } = req.params as { id: string };
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
            await offerService.delete(id);

            return reply.send({
                success: true,
                data: { message: 'Offer deleted successfully' },
            });
        },
    });
}
