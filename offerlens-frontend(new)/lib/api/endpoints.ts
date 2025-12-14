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
} from './types';

/**
 * Analyze an offer letter
 * POST /analyze
 * 
 * @param data - Offer analysis request data
 * @returns Analysis results including red flags, salary comparison, and negotiation tips
 */
export async function analyzeOffer(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiClient.post<AnalyzeResponse>('/analyze', data);
}

/**
 * Extract text from uploaded file
 * POST /extract-text
 * 
 * @param file - File to extract text from (PDF or image)
 * @param onProgress - Optional callback for upload progress
 * @returns Extracted text with confidence score
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
 * 
 * @param data - Feature request data
 * @returns Created feature request
 */
export async function createFeatureRequest(
  data: FeatureRequestCreate
): Promise<FeatureRequest> {
  return apiClient.post<FeatureRequest>('/feature-requests', data);
}

/**
 * List feature requests
 * GET /feature-requests
 * 
 * @param params - Query parameters for filtering and pagination
 * @returns Paginated list of feature requests
 */
export async function listFeatureRequests(params?: {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<FeatureRequestListResponse> {
  return apiClient.get<FeatureRequestListResponse>('/feature-requests', { params });
}

/**
 * Get a single feature request
 * GET /feature-requests/:id
 * 
 * @param id - Feature request ID
 * @returns Feature request details
 */
export async function getFeatureRequest(id: string): Promise<FeatureRequest> {
  return apiClient.get<FeatureRequest>(`/feature-requests/${id}`);
}

/**
 * Vote for a feature request
 * POST /feature-requests/:id/vote
 * 
 * @param id - Feature request ID
 */
export async function voteFeatureRequest(id: string): Promise<void> {
  return apiClient.post<void>(`/feature-requests/${id}/vote`);
}

/**
 * Get available roles
 * GET /roles
 * 
 * @returns List of available job roles
 */
export async function getRoles(): Promise<string[]> {
  const response = await apiClient.get<MetadataResponse>('/roles');
  return response.roles || [];
}

/**
 * Get available experience levels
 * GET /experience-levels
 * 
 * @returns List of experience levels
 */
export async function getExperienceLevels(): Promise<string[]> {
  const response = await apiClient.get<MetadataResponse>('/experience-levels');
  return response.experienceLevels || [];
}

/**
 * Get available cities
 * GET /cities
 * 
 * @returns List of cities
 */
export async function getCities(): Promise<string[]> {
  const response = await apiClient.get<MetadataResponse>('/cities');
  return response.cities || [];
}

/**
 * Check API health
 * GET /health
 * 
 * @returns Health status
 */
export async function checkHealth(): Promise<HealthResponse> {
  return apiClient.get<HealthResponse>('/health');
}

/**
 * List forum posts
 * GET /forum
 * Requirement 14.1: Display list of recent discussions
 * 
 * @param params - Query parameters for filtering and pagination
 * @returns Paginated list of forum posts
 */
export async function listForumPosts(params?: {
  page?: number;
  limit?: number;
}): Promise<ForumPostListResponse> {
  return apiClient.get<ForumPostListResponse>('/forum', { params });
}

/**
 * Get a single forum post
 * GET /forum/:id
 * Requirement 14.3: Display full thread
 * 
 * @param id - Forum post ID
 * @returns Forum post details
 */
export async function getForumPost(id: string): Promise<ForumPost> {
  return apiClient.get<ForumPost>(`/forum/${id}`);
}
