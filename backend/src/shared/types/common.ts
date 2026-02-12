export interface ApiResponse<T> {
    success: boolean;
    data?: T;
    error?: {
        code: string;
        message: string;
        details?: unknown;
    };
    meta?: {
        page: number;
        pageSize: number;
        total: number;
    };
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
    meta: {
        page: number;
        pageSize: number;
        total: number;
    };
}

export enum OfferStatus {
    QUEUED = 'QUEUED',
    PROCESSING = 'PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
}

export type ScoreLabel = 'excellent' | 'good' | 'fair' | 'weak' | 'poor';

export interface PaginationParams {
    page: number;
    pageSize: number;
}
