/**
 * API Endpoints Module
 * 
 * Type-safe API methods for all backend endpoints
 * Uses the configured API client with retry logic and error handling
 */

import { apiClient } from './client';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  TextExtractionResponse,
  FeatureRequestCreate,
  FeatureRequest,
  FeatureRequestListResponse,
  MetadataResponse,
  HealthResponse,
  UploadProgress,
  ForumPost,
  ForumPostListResponse,
  OfferResponse,
} from './types';

/**
 * Upload an offer letter for asynchronous analysis
 * POST /offers
 * 
 * @param file - Offer letter PDF/Image
 * @param email - Optional user email
 * @param onProgress - Upload progress callback
 */
export async function uploadOffer(
  file: File,
  email?: string,
  onProgress?: (progress: UploadProgress) => void
): Promise<OfferResponse> {
  const formData = new FormData();
  formData.append('file', file);
  if (email) {
    formData.append('email', email);
  }

  return apiClient.post<OfferResponse>('/offers', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          percentage,
        });
      }
    },
  });
}

/**
 * Get offer analysis status/results
 * GET /offers/:id
 * 
 * @param id - Offer ID
 */
export async function getOffer(id: string): Promise<OfferResponse> {
  return apiClient.get<OfferResponse>(`/offers/${id}`);
}

/**
 * Submit user corrections for an offer (RLHF)
 * PATCH /offers/:id/corrections
 * 
 * @param id - Offer ID
 * @param corrections - JSON object with corrected fields
 */
export async function submitCorrections(id: string, corrections: Record<string, any>): Promise<OfferResponse> {
  return apiClient.patch<OfferResponse>(`/offers/${id}/corrections`, { corrections });
}

/**
 * Request negotiation script
 * POST /offers/:id/negotiate
 */
export async function negotiateOffer(id: string, email: string): Promise<{ success: boolean; message: string }> {
  return apiClient.post<{ success: boolean; message: string }>(`/offers/${id}/negotiate`, { email });
}

/**
 * Re-analyze an offer with updated details
 * POST /offers/:id/analyze
 */
export async function reanalyzeOffer(
  id: string,
  data: {
    role?: string;
    experience?: string;
    location?: string;
    ctc?: number;
    offerText?: string;
  }
): Promise<OfferResponse> {
  return apiClient.post<OfferResponse>(`/offers/${id}/analyze`, data);
}

/**
 * Analyze an offer letter (Legacy Synchronous)
 * POST /analyze
 * @deprecated Use uploadOffer (async) instead
 */
export async function analyzeOffer(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await apiClient.post<{ success: boolean; data: AnalyzeResponse }>('/analyze', data);
  return response.data;
}

/**
 * Extract text from uploaded file (Legacy)
 * POST /extract-text
 * @deprecated Use uploadOffer instead
 */
export async function extractText(
  file: File,
  onProgress?: (progress: UploadProgress) => void
): Promise<TextExtractionResponse> {
  const formData = new FormData();
  formData.append('file', file);

  return apiClient.post<TextExtractionResponse>('/extract-text', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const percentage = Math.round((progressEvent.loaded * 100) / progressEvent.total);
        onProgress({
          loaded: progressEvent.loaded,
          total: progressEvent.total,
          percentage,
        });
      }
    },
  });
}

/**
 * Submit a feature request
 * POST /feature-requests
 */
export async function createFeatureRequest(
  data: FeatureRequestCreate
): Promise<FeatureRequest> {
  const response = await apiClient.post<{ success: boolean; data: FeatureRequest }>('/feature-requests', data);
  return response.data;
}

/**
 * List feature requests
 * GET /feature-requests
 */
export async function listFeatureRequests(params?: {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<FeatureRequestListResponse> {
  const response = await apiClient.get<{ success: boolean; data: FeatureRequestListResponse['data']; pagination: FeatureRequestListResponse['pagination'] }>('/feature-requests', { params });
  return {
    data: response.data,
    pagination: response.pagination,
  };
}

/**
 * Get a single feature request
 * GET /feature-requests/:id
 */
export async function getFeatureRequest(id: string): Promise<FeatureRequest> {
  const response = await apiClient.get<{ success: boolean; data: FeatureRequest }>(`/feature-requests/${id}`);
  return response.data;
}

/**
 * Vote for a feature request
 * POST /feature-requests/:id/vote
 */
export async function voteFeatureRequest(id: string): Promise<void> {
  return apiClient.post<void>(`/feature-requests/${id}/vote`);
}

/**
 * Get available roles
 * GET /roles
 */
export async function getRoles(): Promise<string[]> {
  const response = await apiClient.get<{ success: boolean; data: string[] }>('/roles');
  return response.data || [];
}

/**
 * Get available experience levels
 * GET /experience-levels
 */
export async function getExperienceLevels(): Promise<string[]> {
  const response = await apiClient.get<{ success: boolean; data: string[] }>('/experience-levels');
  return response.data || [];
}

/**
 * Get available cities
 * GET /cities
 */
export async function getCities(): Promise<string[]> {
  const response = await apiClient.get<{ success: boolean; data: string[] }>('/cities');
  return response.data || [];
}

/**
 * Check API health
 * GET /health
 */
export async function checkHealth(): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>('/health');
}

// --- Forum Endpoints (Commented out: No Backend Implementation) ---
/*
export async function listForumPosts(params?: {
  page?: number;
  limit?: number;
}): Promise<ForumPostListResponse> {
  return apiClient.get<ForumPostListResponse>('/forum', { params });
}

export async function getForumPost(id: string): Promise<ForumPost> {
  return apiClient.get<ForumPost>(`/forum/${id}`);
}
*/
