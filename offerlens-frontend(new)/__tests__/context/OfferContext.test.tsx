/**
 * OfferContext Tests
 * 
 * Tests for the Offer Context state management
 */

import { renderHook, act } from '@testing-library/react';
import { OfferProvider, useOffer } from '@/context/OfferContext';
import type { AnalyzeResponse } from '@/lib/api';

// Mock offer data
const mockOffer: AnalyzeResponse = {
  analysisId: 'test-123',
  redFlags: [
    {
      id: 'rf-1',
      severity: 'high',
      title: 'Long Notice Period',
      description: 'Notice period exceeds industry standard',
    },
  ],
  salaryComparison: {
    range: {
      min: 80000,
      avg: 100000,
      max: 120000,
    },
    comparison: 'aligned',
    difference: 0,
    message: 'Your salary is aligned with market rates',
  },
  takeHome: 75000,
  negotiationSuggestions: [
    {
      id: 'ns-1',
      priority: 'high',
      category: 'Salary',
      suggestion: 'Negotiate for higher base salary',
      reasoning: 'Market rates support a higher offer',
    },
  ],
};

describe('OfferContext', () => {
  describe('useOffer hook', () => {
    it('should throw error when used outside provider', () => {
      // Suppress console.error for this test
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      expect(() => {
        renderHook(() => useOffer());
      }).toThrow('useOffer must be used within an OfferProvider');

      consoleSpy.mockRestore();
    });

    it('should provide initial state', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      expect(result.current.currentOffer).toBeNull();
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set offer data', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      act(() => {
        result.current.setOffer(mockOffer);
      });

      expect(result.current.currentOffer).toEqual(mockOffer);
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set analyzing state', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      act(() => {
        result.current.setAnalyzing(true);
      });

      expect(result.current.isAnalyzing).toBe(true);
      expect(result.current.error).toBeNull();
    });

    it('should clear error when setting analyzing to true', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.error).toBe('Test error');

      act(() => {
        result.current.setAnalyzing(true);
      });

      expect(result.current.error).toBeNull();
    });

    it('should set error state', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      act(() => {
        result.current.setError('Test error');
      });

      expect(result.current.error).toBe('Test error');
      expect(result.current.isAnalyzing).toBe(false);
    });

    it('should clear offer data', () => {
      const { result } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      // Set some data first
      act(() => {
        result.current.setOffer(mockOffer);
        result.current.setError('Test error');
      });

      expect(result.current.currentOffer).toEqual(mockOffer);
      expect(result.current.error).toBe('Test error');

      // Clear everything
      act(() => {
        result.current.clearOffer();
      });

      expect(result.current.currentOffer).toBeNull();
      expect(result.current.isAnalyzing).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should persist state across re-renders', () => {
      const { result, rerender } = renderHook(() => useOffer(), {
        wrapper: OfferProvider,
      });

      act(() => {
        result.current.setOffer(mockOffer);
      });

      expect(result.current.currentOffer).toEqual(mockOffer);

      // Re-render
      rerender();

      // State should persist
      expect(result.current.currentOffer).toEqual(mockOffer);
    });
  });
});
