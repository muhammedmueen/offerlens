import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';

/**
 * API Client Service
 * Requirements: 1.1, 1.2
 * 
 * Provides a centralized axios-based API client with:
 * - Base URL configuration
 * - Request/response interceptors
 * - Error handling
 * - Type-safe API methods
 */

// API Configuration
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

// Create axios instance
const apiClient: AxiosInstance = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000, // 30 seconds
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor
apiClient.interceptors.request.use(
  (config) => {
    // Log request in development
    if (import.meta.env.DEV) {
      console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
    }
    return config;
  },
  (error) => {
    console.error('[API Request Error]', error);
    return Promise.reject(error);
  }
);

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY = 1000; // 1 second

// Helper function to delay execution
const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// Helper function to determine if error is retryable
const isRetryableError = (error: AxiosError): boolean => {
  if (!error.response) {
    // Network errors are retryable
    return true;
  }
  
  // Retry on 5xx server errors and 429 rate limit
  const status = error.response.status;
  return status >= 500 || status === 429;
};

// Response interceptor with retry logic
apiClient.interceptors.response.use(
  (response: AxiosResponse) => {
    // Log response in development
    if (import.meta.env.DEV) {
      console.log(`[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`, response.status);
    }
    return response;
  },
  async (error: AxiosError) => {
    const config = error.config as any;
    
    // Initialize retry count
    if (!config._retryCount) {
      config._retryCount = 0;
    }
    
    // Handle errors
    if (error.response) {
      // Server responded with error status
      console.error('[API Error]', error.response.status, error.response.data);
      
      // Check if we should retry
      if (isRetryableError(error) && config._retryCount < MAX_RETRIES) {
        config._retryCount++;
        
        // Calculate delay with exponential backoff
        const retryDelay = RETRY_DELAY * Math.pow(2, config._retryCount - 1);
        
        console.log(`[API Retry] Attempt ${config._retryCount}/${MAX_RETRIES} after ${retryDelay}ms`);
        
        await delay(retryDelay);
        return apiClient(config);
      }
    } else if (error.request) {
      // Request made but no response
      console.error('[API Error] No response received', error.request);
      
      // Retry network errors
      if (config._retryCount < MAX_RETRIES) {
        config._retryCount++;
        
        const retryDelay = RETRY_DELAY * Math.pow(2, config._retryCount - 1);
        
        console.log(`[API Retry] Network error, attempt ${config._retryCount}/${MAX_RETRIES} after ${retryDelay}ms`);
        
        await delay(retryDelay);
        return apiClient(config);
      }
    } else {
      // Error setting up request
      console.error('[API Error]', error.message);
    }
    
    return Promise.reject(error);
  }
);

// Type definitions for API requests/responses

export interface AnalyzeRequest {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
}

export interface DetectedRedFlag {
  id: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  excerpt?: string;
}

export interface SalaryRange {
  min: number;
  avg: number;
  max: number;
}

export interface SalaryComparison {
  range: SalaryRange;
  comparison: 'below' | 'aligned' | 'above';
  difference: number;
  message: string;
}

export interface NegotiationSuggestion {
  id: string;
  priority: 'high' | 'medium' | 'low';
  category: string;
  suggestion: string;
  reasoning: string;
}

export interface AnalyzeResponse {
  redFlags: DetectedRedFlag[];
  salaryComparison: SalaryComparison;
  takeHome: number;
  negotiationSuggestions: NegotiationSuggestion[];
  analysisId: string;
}

export interface TextExtractionResponse {
  text: string;
  confidence: number;
  success: boolean;
  error?: string;
}

export interface FeatureRequestCreate {
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
}

export interface FeatureRequest {
  id: string;
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
  status: 'submitted' | 'under_review' | 'planned' | 'in_progress' | 'completed' | 'declined';
  votes: number;
  createdAt: string;
  updatedAt: string;
}

export interface FeatureRequestListResponse {
  data: FeatureRequest[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

export interface MetadataResponse {
  roles?: string[];
  experienceLevels?: string[];
  cities?: string[];
}

// API Error class
export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode?: number,
    public code?: string,
    public details?: any
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

// Helper function to handle API errors
function handleApiError(error: unknown): never {
  if (axios.isAxiosError(error)) {
    const axiosError = error as AxiosError<any>;
    
    if (axiosError.response) {
      // Server responded with error
      const errorData = axiosError.response.data?.error || axiosError.response.data;
      throw new ApiError(
        errorData?.message || 'An error occurred',
        axiosError.response.status,
        errorData?.code,
        errorData?.details
      );
    } else if (axiosError.request) {
      // No response received
      throw new ApiError(
        'Unable to connect to the server. Please check your internet connection.',
        0,
        'NETWORK_ERROR'
      );
    }
  }
  
  // Unknown error
  throw new ApiError('An unexpected error occurred');
}

// API Methods

/**
 * Analyze an offer letter
 * POST /api/v1/analyze
 */
export async function analyzeOffer(data: AnalyzeRequest): Promise<AnalyzeResponse> {
  try {
    const response = await apiClient.post<AnalyzeResponse>('/analyze', data);
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Extract text from uploaded file
 * POST /api/v1/extract-text
 */
export async function extractText(file: File): Promise<TextExtractionResponse> {
  try {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await apiClient.post<TextExtractionResponse>('/extract-text', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Submit a feature request
 * POST /api/v1/feature-requests
 */
export async function createFeatureRequest(data: FeatureRequestCreate): Promise<FeatureRequest> {
  try {
    const response = await apiClient.post<FeatureRequest>('/feature-requests', data);
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * List feature requests
 * GET /api/v1/feature-requests
 */
export async function listFeatureRequests(params?: {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}): Promise<FeatureRequestListResponse> {
  try {
    const response = await apiClient.get<FeatureRequestListResponse>('/feature-requests', { params });
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Get a single feature request
 * GET /api/v1/feature-requests/:id
 */
export async function getFeatureRequest(id: string): Promise<FeatureRequest> {
  try {
    const response = await apiClient.get<FeatureRequest>(`/feature-requests/${id}`);
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Vote for a feature request
 * POST /api/v1/feature-requests/:id/vote
 */
export async function voteFeatureRequest(id: string): Promise<void> {
  try {
    await apiClient.post(`/feature-requests/${id}/vote`);
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Get available roles
 * GET /api/v1/roles
 */
export async function getRoles(): Promise<string[]> {
  try {
    const response = await apiClient.get<MetadataResponse>('/roles');
    return response.data.roles || [];
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Get available experience levels
 * GET /api/v1/experience-levels
 */
export async function getExperienceLevels(): Promise<string[]> {
  try {
    const response = await apiClient.get<MetadataResponse>('/experience-levels');
    return response.data.experienceLevels || [];
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Get available cities
 * GET /api/v1/cities
 */
export async function getCities(): Promise<string[]> {
  try {
    const response = await apiClient.get<MetadataResponse>('/cities');
    return response.data.cities || [];
  } catch (error) {
    handleApiError(error);
  }
}

/**
 * Check API health
 * GET /api/v1/health
 */
export async function checkHealth(): Promise<{ status: string }> {
  try {
    const response = await apiClient.get<{ status: string }>('/health');
    return response.data;
  } catch (error) {
    handleApiError(error);
  }
}

export default apiClient;
