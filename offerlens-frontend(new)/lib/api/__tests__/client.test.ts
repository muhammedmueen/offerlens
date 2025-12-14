/**
 * API Client Unit Tests
 * 
 * Tests for the API client configuration and basic functionality
 */

import { ApiClient } from '../client';

describe('ApiClient', () => {
  describe('Configuration', () => {
    it('should use default configuration when no config provided', () => {
      const client = new ApiClient();
      const baseURL = client.getBaseURL();
      
      // Should use environment variable or default
      expect(baseURL).toBeDefined();
      expect(typeof baseURL).toBe('string');
    });

    it('should use custom configuration when provided', () => {
      const customConfig = {
        baseURL: 'https://custom-api.example.com',
        timeout: 5000,
        retryAttempts: 5,
        retryDelay: 2000,
      };
      
      const client = new ApiClient(customConfig);
      expect(client.getBaseURL()).toBe('https://custom-api.example.com');
    });
  });

  describe('buildUrl', () => {
    it('should build correct URL from endpoint path', () => {
      const client = new ApiClient({ baseURL: 'https://api.example.com' });
      
      expect(client.buildUrl('/analyze')).toBe('https://api.example.com/analyze');
      expect(client.buildUrl('analyze')).toBe('https://api.example.com/analyze');
    });

    it('should handle trailing slash in base URL', () => {
      const client = new ApiClient({ baseURL: 'https://api.example.com/' });
      
      expect(client.buildUrl('/analyze')).toBe('https://api.example.com/analyze');
      expect(client.buildUrl('analyze')).toBe('https://api.example.com/analyze');
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors gracefully', async () => {
      const client = new ApiClient({
        baseURL: 'https://nonexistent-domain-12345.com',
        timeout: 1000,
        retryAttempts: 1, // Reduce retries for faster test
      });

      await expect(client.get('/test')).rejects.toMatchObject({
        message: expect.stringContaining('connect'),
        status: 0,
      });
    });
  });
});
