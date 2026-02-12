import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { ZodError } from 'zod';

export const errorHandler = (
    error: FastifyError,
    request: FastifyRequest,
    reply: FastifyReply
) => {
    const requestId = request.id;

    // 1. Handle Known App Errors
    if (error instanceof AppError) {
        if (error.statusCode >= 500) {
            request.log.error({ err: error, requestId }, 'AppError (5xx)');
        } else {
            request.log.warn({ err: error, requestId }, 'AppError (4xx)');
        }

        return reply.status(error.statusCode).send({
            success: false,
            error: {
                code: error.code,
                message: error.message,
                details: error.details,
            },
        });
    }

    // 2. Handle Zod Validation Errors
    if (error instanceof ZodError) {
        return reply.status(400).send({
            success: false,
            error: {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: 'Invalid request data',
                details: error.flatten(),
            },
        });
    }

    // 3. Handle Fastify/AJV Validation Errors
    if (error.validation) {
        return reply.status(400).send({
            success: false,
            error: {
                code: ERROR_CODES.VALIDATION_ERROR,
                message: error.message,
                details: error.validation,
            },
        });
    }

    // 4. Handle Rate Limit Errors
    if (error.statusCode === 429) {
        return reply.status(429).send({
            success: false,
            error: {
                code: ERROR_CODES.RATE_LIMIT_EXCEEDED,
                message: 'Too many requests, please try again later.',
            },
        });
    }

    // 5. Handle File Size Errors (Multipart)
    if (error.code === 'FST_REQ_FILE_TOO_LARGE') {
        return reply.status(400).send({
            success: false,
            error: {
                code: ERROR_CODES.FILE_TOO_LARGE,
                message: 'File is too large. Maximum size is 10MB.',
            },
        });
    }

    // 6. Global Catch-All (Internal Server Error)
    request.log.error({ err: error, requestId }, 'Unhandled Internal Server Error');

    return reply.status(500).send({
        success: false,
        error: {
            code: ERROR_CODES.INTERNAL_ERROR,
            message: 'Something went wrong. Please try again later.',
        },
    });
};
