import request from 'supertest';
import { createApp } from '../../app';
import { Application } from 'express';
import { analysisService } from '../../services';

/**
 * Integration tests for Analysis Controller
 * Requirements: 1.2, 2.1, 2.2, 2.3
 */

// Mock the analysis service to avoid database dependencies
jest.mock('../../services', () => ({
  analysisService: {
    analyze: jest.fn(),
  },
}));

describe('Analysis Controller', () => {
  let app: Application;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /api/v1/analyze', () => {
    it('should analyze an offer and return results', async () => {
      const offerData = {
        offerText: `
          Dear Candidate,
          
          We are pleased to offer you the position of Software Engineer.
          
          Compensation:
          - Base Salary: 12 LPA
          - Performance Bonus: 2 LPA
          
          Terms:
          - Notice Period: 90 days
          - Probation: 6 months
          - Training Bond: You agree to serve the company for 2 years or pay Rs. 2,00,000
          
          Please sign and return this offer letter.
        `,
        role: 'Software Engineer',
        experience: 'Mid-Level (3-5 years)',
        ctc: 14,
        city: 'Bangalore',
      };

      // Mock the analysis service response
      const mockAnalysisResult = {
        redFlags: [
          {
            id: '1',
            ruleId: 'training-bond',
            severity: 'high' as const,
            title: 'Training Bond',
            description: 'Training bond detected',
            matchedKeyword: 'training bond',
            excerpt: '...Training Bond: You agree to serve the company for 2 years...',
          },
        ],
        salaryComparison: {
          range: { min: 10, avg: 15, max: 20 },
          comparison: 'below' as const,
          difference: -1,
          message: 'Your offer is below market average',
        },
        takeHome: 81666,
        negotiationSuggestions: [
          {
            id: 'salary-raise',
            category: 'Compensation',
            icon: '💰',
            title: 'Request Salary Adjustment',
            suggestion: 'Ask for a raise',
            priority: 'high' as const,
          },
        ],
        analysisId: 'analysis_123',
      };

      (analysisService.analyze as jest.Mock).mockResolvedValue(mockAnalysisResult);

      const response = await request(app)
        .post('/api/v1/analyze')
        .send(offerData)
        .expect('Content-Type', /json/)
        .expect(200);

      // Verify response structure
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('data');
      
      const { data } = response.body;
      
      // Verify all required fields are present
      expect(data).toHaveProperty('redFlags');
      expect(data).toHaveProperty('salaryComparison');
      expect(data).toHaveProperty('takeHome');
      expect(data).toHaveProperty('negotiationSuggestions');
      expect(data).toHaveProperty('analysisId');

      // Verify data types
      expect(Array.isArray(data.redFlags)).toBe(true);
      expect(typeof data.salaryComparison).toBe('object');
      expect(typeof data.takeHome).toBe('number');
      expect(Array.isArray(data.negotiationSuggestions)).toBe(true);
      expect(typeof data.analysisId).toBe('string');

      // Verify salary comparison structure
      expect(data.salaryComparison).toHaveProperty('range');
      expect(data.salaryComparison).toHaveProperty('comparison');
      expect(data.salaryComparison).toHaveProperty('difference');
      expect(data.salaryComparison).toHaveProperty('message');
      expect(['below', 'aligned', 'above']).toContain(data.salaryComparison.comparison);

      // Verify red flags structure (if any detected)
      if (data.redFlags.length > 0) {
        const redFlag = data.redFlags[0];
        expect(redFlag).toHaveProperty('id');
        expect(redFlag).toHaveProperty('ruleId');
        expect(redFlag).toHaveProperty('severity');
        expect(redFlag).toHaveProperty('title');
        expect(redFlag).toHaveProperty('description');
        expect(redFlag).toHaveProperty('matchedKeyword');
        expect(redFlag).toHaveProperty('excerpt');
        expect(['high', 'medium', 'low']).toContain(redFlag.severity);
      }

      // Verify negotiation suggestions structure
      if (data.negotiationSuggestions.length > 0) {
        const suggestion = data.negotiationSuggestions[0];
        expect(suggestion).toHaveProperty('id');
        expect(suggestion).toHaveProperty('category');
        expect(suggestion).toHaveProperty('icon');
        expect(suggestion).toHaveProperty('title');
        expect(suggestion).toHaveProperty('suggestion');
        expect(suggestion).toHaveProperty('priority');
        expect(['high', 'medium', 'low']).toContain(suggestion.priority);
      }
    });

    it('should reject request with missing required fields', async () => {
      const invalidData = {
        offerText: 'Short text',
        role: 'Software Engineer',
        // Missing experience, ctc, city
      };

      const response = await request(app)
        .post('/api/v1/analyze')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should reject request with offer text too short', async () => {
      const invalidData = {
        offerText: 'Too short',
        role: 'Software Engineer',
        experience: 'Mid-Level (3-5 years)',
        ctc: 14,
        city: 'Bangalore',
      };

      const response = await request(app)
        .post('/api/v1/analyze')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('message');
    });

    it('should reject request with invalid CTC', async () => {
      const invalidData = {
        offerText: 'A'.repeat(150),
        role: 'Software Engineer',
        experience: 'Mid-Level (3-5 years)',
        ctc: -5, // Invalid negative CTC
        city: 'Bangalore',
      };

      const response = await request(app)
        .post('/api/v1/analyze')
        .send(invalidData)
        .expect('Content-Type', /json/)
        .expect(400);

      expect(response.body).toHaveProperty('error');
    });

    it('should handle analysis with no red flags gracefully', async () => {
      const cleanOffer = {
        offerText: `
          Dear Candidate,
          
          We are pleased to offer you the position of Software Engineer.
          
          Compensation:
          - Base Salary: 20 LPA
          - Performance Bonus: 3 LPA
          
          Terms:
          - Notice Period: 30 days
          - Probation: 3 months
          
          We look forward to having you on our team.
        `,
        role: 'Software Engineer',
        experience: 'Mid-Level (3-5 years)',
        ctc: 23,
        city: 'Bangalore',
      };

      // Mock clean analysis result
      const mockCleanResult = {
        redFlags: [],
        salaryComparison: {
          range: { min: 10, avg: 15, max: 20 },
          comparison: 'above' as const,
          difference: 8,
          message: 'Your offer exceeds market average',
        },
        takeHome: 134166,
        negotiationSuggestions: [
          {
            id: 'general-positive',
            category: 'General',
            icon: '✨',
            title: 'Clean Offer',
            suggestion: 'Your offer appears to have no major red flags',
            priority: 'low' as const,
          },
        ],
        analysisId: 'analysis_456',
      };

      (analysisService.analyze as jest.Mock).mockResolvedValue(mockCleanResult);

      const response = await request(app)
        .post('/api/v1/analyze')
        .send(cleanOffer)
        .expect('Content-Type', /json/)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('redFlags');
      expect(response.body.data).toHaveProperty('negotiationSuggestions');
      expect(Array.isArray(response.body.data.redFlags)).toBe(true);
      expect(Array.isArray(response.body.data.negotiationSuggestions)).toBe(true);
    });

    it('should return different analysis IDs for different requests', async () => {
      const offerData = {
        offerText: 'A'.repeat(150),
        role: 'Software Engineer',
        experience: 'Mid-Level (3-5 years)',
        ctc: 14,
        city: 'Bangalore',
      };

      // Mock first response
      (analysisService.analyze as jest.Mock).mockResolvedValueOnce({
        redFlags: [],
        salaryComparison: {
          range: { min: 10, avg: 15, max: 20 },
          comparison: 'aligned' as const,
          difference: 0,
          message: 'Aligned with market',
        },
        takeHome: 81666,
        negotiationSuggestions: [],
        analysisId: 'analysis_789',
      });

      // Mock second response with different ID
      (analysisService.analyze as jest.Mock).mockResolvedValueOnce({
        redFlags: [],
        salaryComparison: {
          range: { min: 10, avg: 15, max: 20 },
          comparison: 'aligned' as const,
          difference: 0,
          message: 'Aligned with market',
        },
        takeHome: 81666,
        negotiationSuggestions: [],
        analysisId: 'analysis_101',
      });

      const response1 = await request(app)
        .post('/api/v1/analyze')
        .send(offerData)
        .expect(200);

      const response2 = await request(app)
        .post('/api/v1/analyze')
        .send(offerData)
        .expect(200);

      expect(response1.body.data.analysisId).not.toBe(response2.body.data.analysisId);
    });
  });
});
