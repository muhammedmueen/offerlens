"use client";

/**
 * useOfferAnalysis Hook
 * 
 * Custom hook that combines TanStack Query with Offer Context
 * for managing offer analysis operations
 */

import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useOffer } from '@/context/OfferContext';
import { analyzeOffer, type AnalyzeRequest, type AnalyzeResponse, type ApiError } from '@/lib/api';

/**
 * Hook for analyzing offers
 * 
 * Combines:
 * - TanStack Query mutation for API call
 * - Offer context for state management
 * - Router for navigation
 * 
 * Requirements:
 * - 4.1: Store uploaded offer data in state
 * - 4.3: Loading state prevents duplicate requests
 */
export function useOfferAnalysis() {
  const router = useRouter();
  const { setOffer, setAnalyzing, setError } = useOffer();

  const mutation = useMutation<AnalyzeResponse, ApiError, AnalyzeRequest>({
    mutationFn: analyzeOffer,
    
    onMutate: () => {
      // Set analyzing state when mutation starts
      // Requirement 4.3: Loading state prevents duplicate requests
      setAnalyzing(true);
    },
    
    onSuccess: (data, variables) => {
      // Store offer data in context
      // Requirement 4.1: Store uploaded offer data in state
      setOffer(data, {
        role: variables.role,
        experience: variables.experience,
        city: variables.city,
        ctc: variables.ctc,
        offerText: variables.offerText,
      });
      
      // Navigate to results page
      // Requirement 2.5: Successful upload navigates to results
      router.push('/results');
    },
    
    onError: (error) => {
      // Set error state
      setError(error.message);
      setAnalyzing(false);
    },
  });

  return {
    analyze: mutation.mutate,
    analyzeAsync: mutation.mutateAsync,
    isAnalyzing: mutation.isPending,
    error: mutation.error,
    data: mutation.data,
    reset: mutation.reset,
  };
}

export default useOfferAnalysis;
