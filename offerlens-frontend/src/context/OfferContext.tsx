import React, { createContext, useContext, useState, ReactNode } from "react";
import { analyzeOffer, AnalyzeResponse, ApiError } from "@/lib/api";

/**
 * Offer Context
 * Requirements: 1.2, 2.2
 * 
 * Manages offer data and analysis state
 * - Stores offer input data
 * - Calls backend API for analysis
 * - Handles loading and error states
 */

export interface OfferData {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
  fileName?: string;
}

export interface AnalysisResult extends AnalyzeResponse {
  offerData: OfferData;
}

interface OfferContextType {
  offerData: OfferData | null;
  analysisResult: AnalysisResult | null;
  isAnalyzing: boolean;
  analysisError: string | null;
  setOfferData: (data: OfferData) => void;
  analyzeOfferData: (data: OfferData) => Promise<void>;
  clearOfferData: () => void;
  clearAnalysis: () => void;
}

const OfferContext = createContext<OfferContextType | undefined>(undefined);

export function OfferProvider({ children }: { children: ReactNode }) {
  const [offerData, setOfferDataState] = useState<OfferData | null>(null);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  const setOfferData = (data: OfferData) => {
    setOfferDataState(data);
    setAnalysisError(null);
  };

  const analyzeOfferData = async (data: OfferData) => {
    setIsAnalyzing(true);
    setAnalysisError(null);
    setOfferDataState(data);

    try {
      // Call backend API to analyze offer
      const result = await analyzeOffer({
        offerText: data.offerText,
        role: data.role,
        experience: data.experience,
        ctc: data.ctc,
        city: data.city,
      });

      // Store analysis result with offer data
      setAnalysisResult({
        ...result,
        offerData: data,
      });
    } catch (error) {
      console.error('Analysis error:', error);
      
      if (error instanceof ApiError) {
        // Check if it's a network error (backend down)
        if (error.statusCode === 0) {
          setAnalysisError('Unable to connect to the server. The service may be temporarily unavailable. Please try again in a few moments.');
        } else if (error.statusCode === 429) {
          setAnalysisError('Too many requests. Please wait a moment and try again.');
        } else if (error.statusCode && error.statusCode >= 500) {
          setAnalysisError('The server is experiencing issues. Please try again in a few moments.');
        } else {
          setAnalysisError(error.message);
        }
      } else {
        setAnalysisError('An unexpected error occurred during analysis. Please try again.');
      }
      
      // Clear analysis result on error
      setAnalysisResult(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const clearOfferData = () => {
    setOfferDataState(null);
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  const clearAnalysis = () => {
    setAnalysisResult(null);
    setAnalysisError(null);
  };

  return (
    <OfferContext.Provider
      value={{
        offerData,
        analysisResult,
        isAnalyzing,
        analysisError,
        setOfferData,
        analyzeOfferData,
        clearOfferData,
        clearAnalysis,
      }}
    >
      {children}
    </OfferContext.Provider>
  );
}

export function useOffer() {
  const context = useContext(OfferContext);
  if (context === undefined) {
    throw new Error("useOffer must be used within an OfferProvider");
  }
  return context;
}
