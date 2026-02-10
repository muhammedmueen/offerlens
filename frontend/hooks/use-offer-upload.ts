"use client";

import { useState, useCallback, useRef } from 'react';
import { uploadOffer, getOffer, type OfferResponse, type UploadProgress, type OfferStatus } from '@/lib/api';
import { useToast } from '@/hooks/use-toast';

interface UseOfferUploadReturn {
    upload: (file: File, email?: string) => Promise<OfferResponse>;
    status: OfferStatus | 'IDLE';
    progress: number;
    offer: OfferResponse | null;
    error: Error | null;
    isUploading: boolean;
    isProcessing: boolean;
    reset: () => void;
}

/**
 * Hook to handle Async Offer Upload & Polling
 * 
 * Flow:
 * 1. Uploads file -> gets ID (202 Accepted)
 * 2. Polls /offers/:id until status is COMPLETED or FAILED
 * 3. Returns final result
 */
export function useOfferUpload(): UseOfferUploadReturn {
    const [status, setStatus] = useState<OfferStatus | 'IDLE'>('IDLE');
    const [progress, setProgress] = useState(0);
    const [offer, setOffer] = useState<OfferResponse | null>(null);
    const [error, setError] = useState<Error | null>(null);

    const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
    const { toast } = useToast();

    const cleanup = useCallback(() => {
        if (pollIntervalRef.current) {
            clearInterval(pollIntervalRef.current);
            pollIntervalRef.current = null;
        }
    }, []);

    const reset = useCallback(() => {
        cleanup();
        setStatus('IDLE');
        setProgress(0);
        setOffer(null);
        setError(null);
    }, [cleanup]);

    const pollStatus = useCallback(async (offerId: string) => {
        try {
            const result = await getOffer(offerId);
            setOffer(result);
            setStatus(result.status);

            if (result.status === 'COMPLETED' || result.status === 'FAILED') {
                cleanup();
                if (result.status === 'FAILED') {
                    setError(new Error('Analysis failed. Please try again.'));
                }
            }
        } catch (err) {
            cleanup();
            setError(err instanceof Error ? err : new Error('Failed to check offer status'));
            setStatus('FAILED');
        }
    }, [cleanup]);

    const upload = useCallback(async (file: File, email?: string): Promise<OfferResponse> => {
        reset();
        setStatus('QUEUED'); // Initial state matches backend or close to it

        try {
            // Step 1: Upload
            const initialResponse = await uploadOffer(file, email, (p) => {
                setProgress(p.percentage);
            });

            setOffer(initialResponse);
            setStatus(initialResponse.status);

            // Step 2: Start Polling if pending
            if (initialResponse.status === 'QUEUED' || initialResponse.status === 'PROCESSING') {
                pollIntervalRef.current = setInterval(() => {
                    pollStatus(initialResponse.id);
                }, 2000); // Poll every 2s
            }

            return initialResponse;
        } catch (err) {
            const e = err instanceof Error ? err : new Error('Upload failed');
            setError(e);
            setStatus('FAILED');
            toast({
                title: "Upload Failed",
                description: e.message,
                variant: "destructive",
            });
            throw e;
        }
    }, [reset, pollStatus, toast]);

    return {
        upload,
        status,
        progress,
        offer,
        error,
        isUploading: status === 'QUEUED' && progress < 100, // Roughly
        isProcessing: status === 'PROCESSING' || (status === 'QUEUED' && progress === 100),
        reset
    };
}
