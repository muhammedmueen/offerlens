
export enum OfferStatus {
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export interface CreateOfferInput {
    file?: {
        filename: string;
        mimetype: string;
        encoding: string;
        toBuffer: () => Promise<Buffer>;
    };
    text?: string;
    role?: string;
    experienceLevel?: string;
    city?: string;
    currentCtc?: number;
    model?: string;
}

export interface OfferResponse {
    id: string;
    status: string;
    createdAt: Date;
    expiresAt?: Date | null;
    isGuest: boolean;
    estimatedProcessingTime?: number;
    rawText?: string | null;
    failureReason?: string | null;
}
