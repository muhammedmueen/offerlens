/**
 * API Module
 * 
 * Central export point for all API-related functionality
 */

// Export API client
export { apiClient, ApiClient } from './client';
export type { ApiClientConfig, ApiError } from './client';

// Export all types
export type {
  AnalyzeRequest,
  AnalyzeResponse,
  DetectedRedFlag,
  SalaryRange,
  SalaryComparison,
  NegotiationSuggestion,
  TextExtractionResponse,
  FeatureRequestCreate,
  FeatureRequest,
  FeatureRequestListResponse,
  MetadataResponse,
  UploadProgress,
  UploadOptions,
} from './types';

// Export all endpoint functions
export {
  analyzeOffer,
  extractText,
  createFeatureRequest,
  listFeatureRequests,
  getFeatureRequest,
  voteFeatureRequest,
  getRoles,
  getExperienceLevels,
  getCities,
  checkHealth,
  uploadOffer,
  getOffer,
  submitCorrections,
  negotiateOffer,
  reanalyzeOffer,
} from './endpoints';
