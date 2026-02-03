"use client";

/**
 * Offer Context
 * 
 * Provides global state management for offer analysis data
 * Requirements: 4.1, 4.2, 4.3, 4.5
 */

import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type { AnalyzeResponse } from '@/lib/api';

/**
 * Offer Details Interface
 * Stores the original offer input data
 */
export interface OfferDetails {
  role: string;
  experience: string;
  city: string;
  ctc: number;
  offerText: string;
}

/**
 * Offer State Interface
 * Requirement 4.1: Store uploaded offer data in state
 */
export interface OfferState {
  currentOffer: AnalyzeResponse | null;
  offerDetails: OfferDetails | null;
  isAnalyzing: boolean;
  error: string | null;
}

/**
 * Offer Context Value Interface
 * Requirement 4.5: Multiple components access shared state
 */
export interface OfferContextValue extends OfferState {
  setOffer: (offer: AnalyzeResponse, details: OfferDetails) => void;
  clearOffer: () => void;
  setAnalyzing: (analyzing: boolean) => void;
  setError: (error: string | null) => void;
}

/**
 * Create the context with undefined default
 * This ensures consumers must use the provider
 */
const OfferContext = createContext<OfferContextValue | undefined>(undefined);

/**
 * Offer Provider Props
 */
export interface OfferProviderProps {
  children: ReactNode;
}

/**
 * Offer Provider Component
 * 
 * Wraps the application to provide offer state to all components
 * Requirement 4.2: State persists across navigation
 */
export function OfferProvider({ children }: OfferProviderProps) {
  // State management
  const [currentOffer, setCurrentOffer] = useState<AnalyzeResponse | null>(null);
  const [offerDetails, setOfferDetails] = useState<OfferDetails | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  const [error, setErrorState] = useState<string | null>(null);

  /**
   * Set the current offer data
   * Requirement 4.1: Store uploaded offer data in state
   */
  const setOffer = useCallback((offer: AnalyzeResponse, details: OfferDetails) => {
    setCurrentOffer(offer);
    setOfferDetails(details);
    setIsAnalyzing(false);
    setErrorState(null);
  }, []);

  /**
   * Clear the current offer data
   * Used when starting a new analysis or navigating away
   */
  const clearOffer = useCallback(() => {
    setCurrentOffer(null);
    setOfferDetails(null);
    setIsAnalyzing(false);
    setErrorState(null);
  }, []);

  /**
   * Set the analyzing state
   * Requirement 4.3: Loading state prevents duplicate requests
   */
  const setAnalyzing = useCallback((analyzing: boolean) => {
    setIsAnalyzing(analyzing);
    if (analyzing) {
      setErrorState(null);
    }
  }, []);

  /**
   * Set error state
   */
  const setError = useCallback((error: string | null) => {
    setErrorState(error);
    setIsAnalyzing(false);
  }, []);

  // Context value
  const value: OfferContextValue = {
    currentOffer,
    offerDetails,
    isAnalyzing,
    error,
    setOffer,
    clearOffer,
    setAnalyzing,
    setError,
  };

  return (
    <OfferContext.Provider value={value}>
      {children}
    </OfferContext.Provider>
  );
}

/**
 * useOffer Hook
 * 
 * Custom hook to access offer context
 * Requirement 4.5: Multiple components access shared state
 * 
 * @throws {Error} If used outside of OfferProvider
 */
export function useOffer(): OfferContextValue {
  const context = useContext(OfferContext);
  
  if (context === undefined) {
    throw new Error('useOffer must be used within an OfferProvider');
  }
  
  return context;
}

/**
 * Export context for testing purposes
 */
export { OfferContext };
