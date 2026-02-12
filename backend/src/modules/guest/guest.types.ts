import { Guest } from '@/db/schema/guests.js';

export interface GuestIdentity {
    fingerprint: string;
    ip: string;
}

export interface GuestLimits {
    remainingAnalyses: number;
    resetAt: Date;
}
