import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';
import { SUPPORTED_FILE_TYPES } from '@/config/constants.js';

/**
 * Pull the uploaded file out of a multipart request body.
 *
 * ── WHY THIS EXISTS ───────────────────────────────────────────────────────────
 * `plugins/multipart.ts` registers `@fastify/multipart` with `attachFieldsToBody: true`.
 * That option consumes the multipart stream during validation and hangs the parsed parts off
 * `request.body`, which means `request.file()` finds nothing left and returns undefined.
 *
 * `POST /offers` was written for that shape and works. `POST /offers/extract-file` was
 * written against `request.file()` and therefore answered `400 "File is required"` to every
 * upload that has ever been sent to it — file-upload autofill was dead end to end, for a
 * reason that had nothing to do with OCR or credentials.
 *
 * One reader for both routes, so the next route cannot pick the wrong half of the API.
 *
 * ── WHY THE TYPE CHECK IS HERE ────────────────────────────────────────────────
 * `SUPPORTED_FILE_TYPES` had been declared in constants.ts and referenced by nothing, so no
 * upload route validated the type of what it was handed. That was harmless on extract-file
 * only because the route rejected everything anyway; fixing the route makes it live. It is a
 * public, unauthenticated endpoint that writes the payload to disk and hands the path to an
 * OCR provider, so the check belongs at the door.
 *
 * Size is already bounded by the plugin's `limits.fileSize`, and `limits.files: 1` means
 * there is at most one file part to find.
 */

/** The subset of `@fastify/multipart`'s file part that anything downstream actually uses. */
export interface UploadedFile {
    type: 'file';
    filename: string;
    mimetype: string;
    encoding: string;
    toBuffer: () => Promise<Buffer>;
}

function isFilePart(part: unknown): part is UploadedFile {
    return !!part
        && typeof part === 'object'
        && (part as { type?: unknown }).type === 'file'
        && typeof (part as { toBuffer?: unknown }).toBuffer === 'function';
}

/**
 * Returns the file part, or null when the request carried no file — which is legitimate on
 * `POST /offers`, where text may be pasted instead.
 *
 * Throws 400 for a file of an unsupported type.
 */
export function readUploadedFile(body: unknown): UploadedFile | null {
    if (!body || typeof body !== 'object') return null;

    // Flattened one level: a repeated field name arrives as an array of parts.
    const parts = Object.values(body as Record<string, unknown>).flat();
    const file = parts.find(isFilePart);

    if (!file) return null;

    if (!(SUPPORTED_FILE_TYPES as readonly string[]).includes(file.mimetype)) {
        // The rejected mimetype is deliberately not echoed. It is caller-controlled and this
        // string travels into an error response; naming the allowed set is just as useful to
        // someone holding a .docx and reflects nothing.
        throw new AppError(
            ERROR_CODES.VALIDATION_ERROR,
            'Unsupported file type. Upload a PDF, JPEG, PNG or plain text file.',
            400,
        );
    }

    return file;
}
