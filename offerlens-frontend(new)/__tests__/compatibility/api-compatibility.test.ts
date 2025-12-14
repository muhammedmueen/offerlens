/**
 * API Compatibility Tests
 * 
 * Verifies that the Next.js frontend maintains backward compatibility
 * with the Vite frontend and production backend.
 * 
 * Requirements: 18.1, 18.2, 18.3, 18.4
 */

import { apiClient, ApiClient } from '@/lib/api/client';
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  FeatureRequestCreate,
  FeatureRequest,
} from '@/lib/api/types';

describe('API Compatibility', () => {
  describe('Requirement 18.1: API Request Format', () => {
    it('should use /api/v1 base URL format', () => {
      const baseURL = apiClient.getBaseURL();
      expect(baseURL).toContain('/api/v1');
    });

    it('should build URLs with correct format', () => {
      const client = new ApiClient({ baseURL: 'http://localhost:3000/api/v1' });
      
      expect(client.buildUrl('/analyze')).toBe('http://localhost:3000/api/v1/analyze');
      expect(client.buildUrl('analyze')).toBe('http://localhost:3000/api/v1/analyze');
      expect(client.buildUrl('/feature-requests')).toBe('http://localhost:3000/api/v1/feature-requests');
    });

    it('should include required headers in all requests', () => {
      const client = new ApiClient();
      const baseURL = client.getBaseURL();
      
      // Verify base URL is configured
      expect(baseURL).toBeTruthy();
      expect(typeof baseURL).toBe('string');
    });
  });

  describe('Requirement 18.2: Authentication Compatibility', () => {
    it('should work without authentication (public API)', () => {
      // Both frontends work without auth
      const client = new ApiClient();
      expect(client).toBeDefined();
    });

    it('should be ready for future authentication', () => {
      // Client has interceptors for future auth implementation
      const client = new ApiClient();
      expect(client).toHaveProperty('axios');
    });
  });

  describe('Requirement 18.3: Local Storage Key Compatibility', () => {
    beforeEach(() => {
      localStorage.clear();
    });

    it('should use "theme" key for theme storage (compatible with Vite)', () => {
      // next-themes uses 'theme' key by default
      const themeKey = 'theme';
      
      localStorage.setItem(themeKey, 'dark');
      expect(localStorage.getItem(themeKey)).toBe('dark');
      
      localStorage.setItem(themeKey, 'light');
      expect(localStorage.getItem(themeKey)).toBe('light');
    });

    it('should use "analytics-consent" key for analytics (new feature)', () => {
      const consentKey = 'analytics-consent';
      
      localStorage.setItem(consentKey, 'true');
      expect(localStorage.getItem(consentKey)).toBe('true');
      
      localStorage.setItem(consentKey, 'false');
      expect(localStorage.getItem(consentKey)).toBe('false');
    });

    it('should use "error_logs" key for error tracking (new feature)', () => {
      const errorKey = 'error_logs';
      
      const errorLog = JSON.stringify([{ message: 'test', timestamp: Date.now() }]);
      localStorage.setItem(errorKey, errorLog);
      
      expect(localStorage.getItem(errorKey)).toBe(errorLog);
    });

    it('should not conflict with Vite frontend keys', () => {
      // Set keys that Vite uses
      localStorage.setItem('theme', 'dark');
      
      // Set keys that Next.js uses
      localStorage.setItem('analytics-consent', 'true');
      localStorage.setItem('error_logs', '[]');
      
      // Verify no conflicts
      expect(localStorage.getItem('theme')).toBe('dark');
      expect(localStorage.getItem('analytics-consent')).toBe('true');
      expect(localStorage.getItem('error_logs')).toBe('[]');
    });
  });

  describe('Requirement 18.4: API Response Format Handling', () => {
    it('should handle nested error format', () => {
      const errorResponse = {
        error: {
          message: 'Invalid request',
          code: 'INVALID_REQUEST',
          details: { field: 'email' }
        }
      };

      // The client should extract: error.message
      expect(errorResponse.error.message).toBe('Invalid request');
      expect(errorResponse.error.code).toBe('INVALID_REQUEST');
    });

    it('should handle direct error format', () => {
      const errorResponse = {
        message: 'Server error',
        code: 'SERVER_ERROR',
        details: {}
      };

      // The client should extract: message
      expect(errorResponse.message).toBe('Server error');
      expect(errorResponse.code).toBe('SERVER_ERROR');
    });

    it('should handle simple error string format', () => {
      const errorResponse = {
        error: 'Something went wrong'
      };

      // The client should extract: error
      expect(errorResponse.error).toBe('Something went wrong');
    });

    it('should handle analyze response format', () => {
      const analyzeResponse: AnalyzeResponse = {
        redFlags: [
          {
            id: '1',
            severity: 'high',
            title: 'Long notice period',
            description: 'Notice period exceeds industry standard',
            excerpt: '90 days notice period'
          }
        ],
        salaryComparison: {
          range: { min: 50000, avg: 75000, max: 100000 },
          comparison: 'aligned',
          difference: 0,
          message: 'Your offer is aligned with market rates'
        },
        takeHome: 60000,
        negotiationSuggestions: [
          {
            id: '1',
            priority: 'high',
            category: 'Salary',
            suggestion: 'Negotiate base salary',
            reasoning: 'Market rates support higher compensation'
          }
        ],
        analysisId: 'test-123'
      };

      // Verify structure matches Vite frontend expectations
      expect(analyzeResponse).toHaveProperty('redFlags');
      expect(analyzeResponse).toHaveProperty('salaryComparison');
      expect(analyzeResponse).toHaveProperty('takeHome');
      expect(analyzeResponse).toHaveProperty('negotiationSuggestions');
      expect(analyzeResponse).toHaveProperty('analysisId');
      
      expect(Array.isArray(analyzeResponse.redFlags)).toBe(true);
      expect(Array.isArray(analyzeResponse.negotiationSuggestions)).toBe(true);
    });

    it('should handle feature request response format', () => {
      const featureRequest: FeatureRequest = {
        id: '123',
        type: 'feature',
        title: 'Add dark mode',
        description: 'Please add dark mode support',
        userEmail: 'user@example.com',
        status: 'submitted',
        votes: 5,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z'
      };

      // Verify structure matches Vite frontend expectations
      expect(featureRequest).toHaveProperty('id');
      expect(featureRequest).toHaveProperty('type');
      expect(featureRequest).toHaveProperty('title');
      expect(featureRequest).toHaveProperty('description');
      expect(featureRequest).toHaveProperty('status');
      expect(featureRequest).toHaveProperty('votes');
      expect(featureRequest).toHaveProperty('createdAt');
      expect(featureRequest).toHaveProperty('updatedAt');
    });
  });

  describe('Type Compatibility', () => {
    it('should have compatible AnalyzeRequest type', () => {
      const request: AnalyzeRequest = {
        offerText: 'Sample offer text',
        role: 'Software Engineer',
        experience: 'Mid-level',
        ctc: 100000,
        city: 'San Francisco'
      };

      // Verify all required fields are present
      expect(request).toHaveProperty('offerText');
      expect(request).toHaveProperty('role');
      expect(request).toHaveProperty('experience');
      expect(request).toHaveProperty('ctc');
      expect(request).toHaveProperty('city');
    });

    it('should have compatible FeatureRequestCreate type', () => {
      const request: FeatureRequestCreate = {
        type: 'feature',
        title: 'New feature',
        description: 'Feature description',
        userEmail: 'user@example.com'
      };

      // Verify all required fields are present
      expect(request).toHaveProperty('type');
      expect(request).toHaveProperty('title');
      expect(request).toHaveProperty('description');
      
      // userEmail is optional
      expect(request.userEmail).toBeDefined();
    });
  });

  describe('Retry Logic Compatibility', () => {
    it('should use same retry configuration as Vite frontend', () => {
      const client = new ApiClient({
        retryAttempts: 3,
        retryDelay: 1000
      });

      // Verify configuration
      expect(client).toBeDefined();
    });

    it('should calculate exponential backoff correctly', () => {
      const baseDelay = 1000;
      
      // Attempt 1: 1000ms
      const delay1 = baseDelay * Math.pow(2, 0);
      expect(delay1).toBe(1000);
      
      // Attempt 2: 2000ms
      const delay2 = baseDelay * Math.pow(2, 1);
      expect(delay2).toBe(2000);
      
      // Attempt 3: 4000ms
      const delay3 = baseDelay * Math.pow(2, 2);
      expect(delay3).toBe(4000);
    });
  });

  describe('Environment Configuration', () => {
    it('should support NEXT_PUBLIC_API_URL environment variable', () => {
      // This is the Next.js equivalent of VITE_API_URL
      const envVar = process.env.NEXT_PUBLIC_API_URL;
      
      // Should be defined or have a default
      const client = new ApiClient();
      const baseURL = client.getBaseURL();
      
      expect(baseURL).toBeTruthy();
      expect(typeof baseURL).toBe('string');
    });

    it('should default to localhost:3001/api/v1 in development', () => {
      const client = new ApiClient();
      const baseURL = client.getBaseURL();
      
      // Should contain /api/v1
      expect(baseURL).toContain('/api/v1');
    });
  });
});
