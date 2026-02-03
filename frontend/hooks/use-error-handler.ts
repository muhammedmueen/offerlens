/**
 * Error Handler Hook
 * 
 * Provides error handling utilities for components
 * Requirements: 6.2, 6.3, 6.5
 */

import { useState, useCallback } from 'react';
import { logComponentError, formatErrorMessage, isNetworkError, isServerError } from '@/lib/utils/error-logger';
import { toast } from '@/hooks/use-toast';

export interface UseErrorHandlerOptions {
  componentName?: string;
  showToast?: boolean;
  onError?: (error: Error) => void;
}

export interface ErrorState {
  error: Error | null;
  hasError: boolean;
  errorMessage: string | null;
}

export interface UseErrorHandlerReturn extends ErrorState {
  handleError: (error: Error | unknown, action?: string) => void;
  clearError: () => void;
  isNetworkError: boolean;
  isServerError: boolean;
}

/**
 * Hook for handling errors in components
 * 
 * @param options - Configuration options
 * @returns Error state and handler functions
 */
export function useErrorHandler(options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn {
  const { componentName = 'Component', showToast = true, onError } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    hasError: false,
    errorMessage: null,
  });

  /**
   * Handle error with logging and optional toast notification
   * Requirement 6.2: Display user-friendly error messages
   * Requirement 6.5: Log errors for debugging
   */
  const handleError = useCallback(
    (error: Error | unknown, action?: string) => {
      const errorObj = error instanceof Error ? error : new Error(String(error));
      const message = formatErrorMessage(errorObj);

      // Update error state
      setErrorState({
        error: errorObj,
        hasError: true,
        errorMessage: message,
      });

      // Log error
      logComponentError(errorObj, componentName, action);

      // Show toast notification if enabled
      // Requirement 6.2: Display user-friendly error messages
      if (showToast) {
        toast({
          variant: 'destructive',
          title: 'Error',
          description: message,
        });
      }

      // Call custom error handler if provided
      if (onError) {
        onError(errorObj);
      }
    },
    [componentName, showToast, onError]
  );

  /**
   * Clear error state
   */
  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      hasError: false,
      errorMessage: null,
    });
  }, []);

  return {
    ...errorState,
    handleError,
    clearError,
    isNetworkError: errorState.error ? isNetworkError(errorState.error) : false,
    isServerError: errorState.error ? isServerError(errorState.error) : false,
  };
}

/**
 * Hook for handling async operations with error handling
 * 
 * @param asyncFn - Async function to execute
 * @param options - Error handler options
 * @returns Execute function, loading state, and error state
 */
export function useAsyncError<T extends (...args: any[]) => Promise<any>>(
  asyncFn: T,
  options: UseErrorHandlerOptions = {}
) {
  const [isLoading, setIsLoading] = useState(false);
  const errorHandler = useErrorHandler(options);

  const execute = useCallback(
    async (...args: Parameters<T>): Promise<ReturnType<T> | null> => {
      setIsLoading(true);
      errorHandler.clearError();

      try {
        const result = await asyncFn(...args);
        return result;
      } catch (error) {
        errorHandler.handleError(error, asyncFn.name);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [asyncFn, errorHandler]
  );

  return {
    execute,
    isLoading,
    ...errorHandler,
  };
}

export default useErrorHandler;
