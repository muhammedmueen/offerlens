
export enum OfferStatus {
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export interface CreateOfferInput {
    file: {
        filename: string;
        mimetype: string;
        encoding: string;
        toBuffer: () => Promise<Buffer>;
    };
    role?: string;
    experienceYears?: number;
    city?: string;
    expectedCTC?: number;
    currency?: string;
}

export interface OfferResponse {
    id: string;
    status: string;
    createdAt: Date;
    expiresAt?: Date | null;
    isGuest: boolean;
    estimatedProcessingTime?: number;
    rawText?: string | null;
}
