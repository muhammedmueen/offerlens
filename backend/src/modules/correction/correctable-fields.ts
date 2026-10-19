import { AppError } from '@/shared/errors/app-error.js';
import { ERROR_CODES } from '@/shared/errors/error-codes.js';

/**
 * The fields a user may correct, as dotted paths rooted at the analysis row, each with the
 * value type the correction service will accept.
 *
 * This is a SECURITY BOUNDARY, not a nicety. Once a correction is applied by writing into
 * `analyses.extractedData` with `setNestedValue`, an unchecked `field` would be an
 * arbitrary-jsonb-write primitive — so the service rejects any path not in this list before
 * touching the row.
 *
 * ponytail: this duplicates the frontend `CORRECTABLE` list in
 * `frontend/src/components/offers/CorrectionsPanel.tsx`. Ceiling: two hand-kept copies of the
 * same six fields. Upgrade path: generate one from the other if they ever drift.
 */
export const CORRECTABLE_FIELDS = {
    'extractedData.companyName': 'text',
    'extractedData.role': 'text',
    'extractedData.location': 'text',
    'extractedData.compensation.totalCTC': 'number',
    'extractedData.noticePeriod': 'text',
    'extractedData.probationPeriod': 'text',
} as const;

export type CorrectableField = keyof typeof CORRECTABLE_FIELDS;

export const CORRECTABLE_PATHS = Object.keys(CORRECTABLE_FIELDS) as CorrectableField[];

const MAX_TEXT_LENGTH = 200;

export function isCorrectableField(field: string): field is CorrectableField {
    return Object.prototype.hasOwnProperty.call(CORRECTABLE_FIELDS, field);
}

/**
 * Validate a correction's `field` and `correctedValue` against the allowlist, returning the
 * normalised value to persist, or throwing `INVALID_INPUT` (400).
 *
 * `number` fields must be a finite non-negative number (rejects NaN, strings, negatives).
 * `text` fields must be `string | null`, length ≤ 200 — objects and arrays are rejected so
 * `setNestedValue` can never inject structure into `extractedData`.
 */
export function validateCorrection(field: string, correctedValue: unknown): string | number | null {
    if (!isCorrectableField(field)) {
        throw new AppError(ERROR_CODES.INVALID_INPUT, `Field "${field}" cannot be corrected`, 400);
    }

    const type = CORRECTABLE_FIELDS[field];

    if (type === 'number') {
        if (typeof correctedValue !== 'number' || !Number.isFinite(correctedValue) || correctedValue < 0) {
            throw new AppError(ERROR_CODES.INVALID_INPUT, `"${field}" must be a non-negative number`, 400);
        }
        return correctedValue;
    }

    // text
    if (correctedValue === null) return null;
    if (typeof correctedValue !== 'string') {
        throw new AppError(ERROR_CODES.INVALID_INPUT, `"${field}" must be text`, 400);
    }
    if (correctedValue.length > MAX_TEXT_LENGTH) {
        throw new AppError(ERROR_CODES.INVALID_INPUT, `"${field}" is too long (max ${MAX_TEXT_LENGTH} characters)`, 400);
    }
    return correctedValue;
}

/**
 * Write `value` at a plain dotted `path` into a DEEP CLONE of `obj`, returning the clone.
 * Does not mutate the input.
 *
 * Plain dotted paths only (`a.b.c`): every allowlisted path is a dotted scalar, so the
 * `foo[0]` array-index grammar `getNestedValue` carries is unreachable here and is
 * intentionally not supported. The caller MUST validate `path` against the allowlist first
 * (`validateCorrection`), so this writer can never be handed an arbitrary key.
 */
export function setNestedValue<T>(obj: T, path: string, value: unknown): T {
    const clone = structuredClone(obj);
    const parts = path.split('.');
    let current: Record<string, unknown> = clone as Record<string, unknown>;

    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        const next = current[part];
        if (next === null || typeof next !== 'object') {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }

    current[parts[parts.length - 1]] = value;
    return clone;
}
