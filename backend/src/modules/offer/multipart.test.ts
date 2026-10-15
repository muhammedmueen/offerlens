import { describe, it, expect } from 'vitest';
import { readUploadedFile } from './multipart.js';
import { AppError } from '@/shared/errors/app-error.js';

const filePart = (mimetype: string) => ({
    type: 'file' as const,
    filename: 'offer.pdf',
    mimetype,
    encoding: '7bit',
    toBuffer: async () => Buffer.from('x'),
});

const fieldPart = (value: string) => ({ type: 'field' as const, fieldname: 'text', value });

describe('readUploadedFile', () => {
    it('finds the file part regardless of its field name', () => {
        // req.file() returned undefined here because attachFieldsToBody had already drained
        // the stream. This is the shape that is actually present.
        expect(readUploadedFile({ anything: filePart('application/pdf') })?.mimetype)
            .toBe('application/pdf');
    });

    it('ignores non-file fields alongside it', () => {
        const body = { text: fieldPart('pasted letter'), upload: filePart('image/png') };
        expect(readUploadedFile(body)?.mimetype).toBe('image/png');
    });

    it('looks inside an array, because a repeated field name arrives as one', () => {
        expect(readUploadedFile({ file: [filePart('image/jpeg')] })?.mimetype).toBe('image/jpeg');
    });

    it('returns null for a text-only submission', () => {
        // Legitimate on POST /offers: paste instead of upload.
        expect(readUploadedFile({ text: fieldPart('pasted letter') })).toBeNull();
    });

    it('returns null for a missing or non-object body', () => {
        expect(readUploadedFile(undefined)).toBeNull();
        expect(readUploadedFile(null)).toBeNull();
        expect(readUploadedFile('nope')).toBeNull();
        expect(readUploadedFile({})).toBeNull();
    });

    it('rejects a part that claims to be a file but cannot produce bytes', () => {
        // Guards the cast: everything downstream calls toBuffer().
        expect(readUploadedFile({ f: { type: 'file', mimetype: 'application/pdf' } })).toBeNull();
    });

    it('accepts every supported type', () => {
        for (const mime of ['application/pdf', 'image/jpeg', 'image/png', 'text/plain']) {
            expect(readUploadedFile({ f: filePart(mime) }), mime).not.toBeNull();
        }
    });

    it('rejects webp now that it is no longer accepted (task 6.4 — Azure Read has no webp)', () => {
        // Dropped from SUPPORTED_FILE_TYPES: Azure Read does not accept webp and we do not
        // convert it, so it is rejected at the door rather than failing later at the provider.
        try {
            readUploadedFile({ f: filePart('image/webp') });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).statusCode).toBe(400);
        }
    });

    it('rejects an unsupported type with a 400', () => {
        // SUPPORTED_FILE_TYPES existed but was referenced nowhere, so neither public upload
        // route checked it.
        try {
            readUploadedFile({ f: filePart('application/vnd.openxmlformats-officedocument.wordprocessingml.document') });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect(err).toBeInstanceOf(AppError);
            expect((err as AppError).statusCode).toBe(400);
        }
    });

    it('does not reflect the rejected mimetype back to the caller', () => {
        const hostile = 'text/html<script>';
        try {
            readUploadedFile({ f: filePart(hostile) });
            expect.unreachable('should have thrown');
        } catch (err) {
            expect((err as AppError).message).not.toContain(hostile);
        }
    });
});
