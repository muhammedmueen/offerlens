"use client";

/**
 * Query Provider
 * 
 * Wraps the application with TanStack Query (React Query) for API state management
 * Provides caching, background refetching, and request deduplication
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { useState, type ReactNode } from 'react';

/**
 * Query Provider Props
 */
export interface QueryProviderProps {
  children: ReactNode;
}

/**
 * Create Query Client with default configuration
 * 
 * Configuration optimized for:
 * - Caching API responses
 * - Preventing duplicate requests
 * - Background refetching for fresh data
 * - Error handling
 */
function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Stale time: how long data is considered fresh (5 minutes)
        staleTime: 5 * 60 * 1000,
        
        // Cache time: how long unused data stays in cache (10 minutes)
        gcTime: 10 * 60 * 1000,
        
        // Retry failed requests (3 times with exponential backoff)
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
        
        // Refetch on window focus (for fresh data)
        refetchOnWindowFocus: true,
        
        // Don't refetch on mount if data is fresh
        refetchOnMount: false,
        
        // Refetch on reconnect
        refetchOnReconnect: true,
      },
      mutations: {
        // Retry mutations once on failure
        retry: 1,
        retryDelay: 1000,
      },
    },
  });
}

// Browser-side query client (singleton)
let browserQueryClient: QueryClient | undefined = undefined;

/**
 * Get Query Client
 * 
 * Creates a singleton query client for the browser
 * Creates a new client for each SSR request
 */
function getQueryClient() {
  if (typeof window === 'undefined') {
    // Server: always create a new query client
    return makeQueryClient();
  } else {
    // Browser: create query client if it doesn't exist
    if (!browserQueryClient) {
      browserQueryClient = makeQueryClient();
    }
    return browserQueryClient;
  }
}

/**
 * Query Provider Component
 * 
 * Wraps the application to provide TanStack Query functionality
 * Requirement 4.3: Loading state prevents duplicate requests
 */
export function QueryProvider({ children }: QueryProviderProps) {
  // Create query client (only once per browser session)
  const [queryClient] = useState(() => getQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Show React Query DevTools in development */}
      {process.env.NODE_ENV === 'development' && (
        <ReactQueryDevtools initialIsOpen={false} position="bottom" />
      )}
    </QueryClientProvider>
  );
}

export default QueryProvider;
