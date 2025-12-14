/**
 * API Client Module
 * 
 * Provides a centralized Axios-based HTTP client with:
 * - Base URL configuration from environment variables (Requirement 1.1)
 * - Automatic retry logic with exponential backoff (Requirement 1.2)
 * - Error response parsing and user-friendly messages (Requirement 1.3)
 * - Request/response interceptors (Requirement 1.4)
 * - Required headers on all requests (Requirement 1.5)
 * - Error logging for debugging (Requirement 6.5)
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosError, AxiosResponse } from 'axios';
import { logAPIError, isServerError } from '@/lib/utils/error-logger';

/**
 * API Client Configuration Interface
 */
export interface ApiClientConfig {
  baseURL: string;
  timeout: number;
  retryAttempts: number;
  retryDelay: number;
}

/**
 * Structured API Error Interface
 */
export interface ApiError {
  message: string;
  code: string;
  status: number;
  details?: unknown;
}

/**
 * Default configuration for the API client
 */
const DEFAULT_CONFIG: ApiClientConfig = {
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api/v1',
  timeout: 30000, // 30 seconds
  retryAttempts: 3,
  retryDelay: 1000, // 1 second base delay
};

/**
 * Helper function to delay execution (for retry logic)
 */
const delay = (ms: number): Promise<void> => 
  new Promise(resolve => setTimeout(resolve, ms));

/**
 * Determine if an error is retryable
 * Network errors and 5xx server errors are retryable
 */
const isRetryableError = (error: AxiosError): boolean => {
  if (!error.response) {
    // Network errors (no response received) are retryable
    return true;
  }
  
  const status = error.response.status;
  // Retry on 5xx server errors and 429 rate limit
  return status >= 500 || status === 429;
};

/**
 * Parse error response into user-friendly message
 * Requirement 1.3: Error responses are parsed into user-friendly messages
 */
const parseErrorMessage = (error: AxiosError): string => {
  if (!error.response) {
    return 'Unable to connect to the server. Please check your internet connection.';
  }

  const status = error.response.status;
  const data = error.response.data as any;

  // Extract error message from various response formats
  const errorMessage = 
    data?.error?.message || 
    data?.message || 
    data?.error || 
    'An unexpected error occurred';

  // Provide context based on status code
  switch (status) {
    case 400:
      return `Invalid request: ${errorMessage}`;
    case 401:
      return 'Authentication required. Please log in.';
    case 403:
      return 'You do not have permission to perform this action.';
    case 404:
      return 'The requested resource was not found.';
    case 429:
      return 'Too many requests. Please try again later.';
    case 500:
    case 502:
    case 503:
    case 504:
      return 'Server error. Please try again later.';
    default:
      return errorMessage;
  }
};

/**
 * API Client Class
 * 
 * Provides a configured Axios instance with retry logic and error handling
 */
export class ApiClient {
  private axios: AxiosInstance;
  private config: ApiClientConfig;

  constructor(config: Partial<ApiClientConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    
    // Create Axios instance with base configuration
    // Requirement 1.1: Use configured backend URL from environment variables
    this.axios = axios.create({
      baseURL: this.config.baseURL,
      timeout: this.config.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
    });

    this.setupInterceptors();
  }

  /**
   * Set up request and response interceptors
   * Requirement 1.4: Handle 401 responses appropriately
   * Requirement 1.5: Include proper headers
   */
  private setupInterceptors(): void {
    // Request interceptor
    this.axios.interceptors.request.use(
      (config) => {
        // Requirement 1.5: Ensure all requests include required headers
        if (!config.headers['Content-Type']) {
          config.headers['Content-Type'] = 'application/json';
        }
        if (!config.headers['Accept']) {
          config.headers['Accept'] = 'application/json';
        }

        // Log requests in development
        if (process.env.NODE_ENV === 'development') {
          console.log(`[API Request] ${config.method?.toUpperCase()} ${config.url}`);
        }

        return config;
      },
      (error) => {
        console.error('[API Request Error]', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor with retry logic
    // Requirement 1.2: Retry failed requests with exponential backoff
    this.axios.interceptors.response.use(
      (response: AxiosResponse) => {
        // Log successful responses in development
        if (process.env.NODE_ENV === 'development') {
          console.log(
            `[API Response] ${response.config.method?.toUpperCase()} ${response.config.url}`,
            response.status
          );
        }
        return response;
      },
      async (error: AxiosError) => {
        const config = error.config as any;

        // Initialize retry count
        if (!config._retryCount) {
          config._retryCount = 0;
        }

        // Check if we should retry
        if (isRetryableError(error) && config._retryCount < this.config.retryAttempts) {
          config._retryCount++;

          // Calculate delay with exponential backoff
          // Requirement 1.2: Exponential backoff strategy
          const retryDelay = this.config.retryDelay * Math.pow(2, config._retryCount - 1);

          if (process.env.NODE_ENV === 'development') {
            console.log(
              `[API Retry] Attempt ${config._retryCount}/${this.config.retryAttempts} after ${retryDelay}ms`
            );
          }

          await delay(retryDelay);
          return this.axios(config);
        }

        // No more retries, reject with error
        return Promise.reject(error);
      }
    );
  }

  /**
   * Handle and transform Axios errors into structured ApiError
   * Requirement 1.3: Parse error and display user-friendly message
   * Requirement 6.5: Log errors for debugging
   */
  private handleError(error: unknown, endpoint?: string, method?: string): ApiError {
    if (axios.isAxiosError(error)) {
      const axiosError = error as AxiosError;
      const message = parseErrorMessage(axiosError);
      const status = axiosError.response?.status || 0;
      const data = axiosError.response?.data as any;

      // Log API error for debugging
      const errorToLog = new Error(message);
      errorToLog.stack = axiosError.stack;
      logAPIError(
        errorToLog,
        endpoint || axiosError.config?.url || 'unknown',
        method || axiosError.config?.method?.toUpperCase() || 'unknown',
        status
      );

      return {
        message,
        code: data?.error?.code || data?.code || 'UNKNOWN_ERROR',
        status,
        details: data?.error?.details || data?.details,
      };
    }

    // Non-Axios error
    const errorMessage = error instanceof Error ? error.message : 'An unexpected error occurred';
    const errorToLog = error instanceof Error ? error : new Error(errorMessage);
    
    logAPIError(
      errorToLog,
      endpoint || 'unknown',
      method || 'unknown'
    );

    return {
      message: errorMessage,
      code: 'UNKNOWN_ERROR',
      status: 0,
    };
  }

  /**
   * Retry a request function with exponential backoff
   * Used for operations that need custom retry logic
   */
  private async retryRequest<T>(
    fn: () => Promise<T>,
    attempts: number = this.config.retryAttempts
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let i = 0; i < attempts; i++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error as Error;
        
        if (i < attempts - 1) {
          const retryDelay = this.config.retryDelay * Math.pow(2, i);
          await delay(retryDelay);
        }
      }
    }

    throw lastError;
  }

  /**
   * GET request
   */
  async get<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axios.get<T>(url, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error, url, 'GET');
    }
  }

  /**
   * POST request
   */
  async post<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axios.post<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error, url, 'POST');
    }
  }

  /**
   * PUT request
   */
  async put<T>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axios.put<T>(url, data, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error, url, 'PUT');
    }
  }

  /**
   * DELETE request
   */
  async delete<T>(url: string, config?: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.axios.delete<T>(url, config);
      return response.data;
    } catch (error) {
      throw this.handleError(error, url, 'DELETE');
    }
  }

  /**
   * Build full URL from endpoint path
   * Used for testing and validation
   */
  buildUrl(endpoint: string): string {
    const baseURL = this.config.baseURL;
    const cleanBase = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL;
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
    return `${cleanBase}${cleanEndpoint}`;
  }

  /**
   * Get the base URL configuration
   */
  getBaseURL(): string {
    return this.config.baseURL;
  }
}

/**
 * Default API client instance
 * Singleton pattern for application-wide use
 */
export const apiClient = new ApiClient();

export default apiClient;
