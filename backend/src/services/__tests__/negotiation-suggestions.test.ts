import { analysisService } from '../analysis.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Negotiation Suggestions Generator', () => {
  beforeAll(async () => {
    // Ensure database is seeded with test data
    // This assumes the seed script has been run
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('Salary-based suggestions', () => {
    it('should suggest salary raise when offer is below market', async () => {
      const request = {
        offerText: 'Your annual CTC will be 4 LPA. You will report to the engineering manager.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 4, // Below market average of 8 LPA
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      expect(result.negotiationSuggestions).toBeDefined();
      expect(result.negotiationSuggestions.length).toBeGreaterThan(0);

      // Should have a salary raise suggestion
      const salaryRaiseSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'salary-raise'
      );
      expect(salaryRaiseSuggestion).toBeDefined();
      expect(salaryRaiseSuggestion?.priority).toBe('high');
      expect(salaryRaiseSuggestion?.category).toBe('Compensation');
    });

    it('should suggest leveraging position when offer is above market', async () => {
      const request = {
        offerText: 'Your annual CTC will be 15 LPA. You will report to the engineering manager.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 15, // Above market average of 8 LPA
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should have a leverage suggestion
      const leverageSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'salary-leverage'
      );
      expect(leverageSuggestion).toBeDefined();
      expect(leverageSuggestion?.priority).toBe('low');
    });
  });

  describe('Red flag-based suggestions', () => {
    it('should suggest addressing training bond when detected', async () => {
      const request = {
        offerText:
          'Your CTC is 8 LPA. You must sign a service agreement with a 2-year bond. If you leave early, you must recover the training cost of 2 lakhs.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect training bond red flag
      expect(result.redFlags.some((f) => f.ruleId === 'training-bond')).toBe(true);

      // Should have bond removal suggestion
      const bondSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'bond-removal'
      );
      expect(bondSuggestion).toBeDefined();
      expect(bondSuggestion?.priority).toBe('high');
      expect(bondSuggestion?.category).toBe('Contractual Terms');
    });

    it('should suggest limiting non-compete scope when detected', async () => {
      const request = {
        offerText:
          'Your CTC is 8 LPA. You agree not to work with competitors for 2 years after leaving the company.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect non-compete red flag
      expect(result.redFlags.some((f) => f.ruleId === 'non-compete')).toBe(true);

      // Should have non-compete scope suggestion
      const nonCompeteSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'non-compete-scope'
      );
      expect(nonCompeteSuggestion).toBeDefined();
      expect(nonCompeteSuggestion?.priority).toBe('high');
    });

    it('should suggest clarifying bonus terms when clawback detected', async () => {
      const request = {
        offerText:
          'Your CTC is 8 LPA including a performance bonus. If you leave within 1 year, you must repay the bonus.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect bonus clawback red flag
      expect(result.redFlags.some((f) => f.ruleId === 'bonus-clawback')).toBe(true);

      // Should have bonus terms suggestion
      const bonusSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'bonus-terms'
      );
      expect(bonusSuggestion).toBeDefined();
      expect(bonusSuggestion?.priority).toBe('high');
    });

    it('should suggest reducing notice period when long notice detected', async () => {
      const request = {
        offerText:
          'Your CTC is 8 LPA. You must provide 90 days notice before resignation.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect long notice red flag
      expect(result.redFlags.some((f) => f.ruleId === 'long-notice')).toBe(true);

      // Should have notice reduction suggestion
      const noticeSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'notice-reduction'
      );
      expect(noticeSuggestion).toBeDefined();
      expect(noticeSuggestion?.priority).toBe('medium');
    });

    it('should suggest optimizing pay structure when high variable detected', async () => {
      const request = {
        offerText:
          'Your CTC is 8 LPA with 40% variable pay based on performance bonus.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect high variable red flag
      expect(result.redFlags.some((f) => f.ruleId === 'high-variable')).toBe(true);

      // Should have variable-fixed suggestion
      const variableSuggestion = result.negotiationSuggestions.find(
        (s) => s.id === 'variable-fixed'
      );
      expect(variableSuggestion).toBeDefined();
      expect(variableSuggestion?.priority).toBe('medium');
    });
  });

  describe('Priority ordering', () => {
    it('should prioritize suggestions by severity (high > medium > low)', async () => {
      const request = {
        offerText:
          'Your CTC is 4 LPA including gratuity. You must sign a bond for 2 years. Notice period is 90 days. Variable pay is 30%.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 4, // Below market
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      expect(result.negotiationSuggestions.length).toBeGreaterThan(0);

      // Check that high priority suggestions come first
      const priorities = result.negotiationSuggestions.map((s) => s.priority);
      
      // Find indices of different priorities
      const firstMedium = priorities.indexOf('medium');
      const firstLow = priorities.indexOf('low');
      const lastHigh = priorities.lastIndexOf('high');

      // If medium exists, it should come after all highs
      if (firstMedium !== -1 && lastHigh !== -1) {
        expect(firstMedium).toBeGreaterThan(lastHigh);
      }

      // If low exists, it should come after all mediums
      if (firstLow !== -1 && firstMedium !== -1) {
        expect(firstLow).toBeGreaterThan(firstMedium);
      }
    });
  });

  describe('Clean offer scenario', () => {
    it('should provide general positive suggestion when no red flags detected', async () => {
      const request = {
        offerText:
          'Your annual CTC will be 8 LPA. You will report to the engineering manager. Notice period is 30 days.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 8, // Aligned with market
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should have at least one suggestion
      expect(result.negotiationSuggestions.length).toBeGreaterThan(0);

      // If no red flags, should have general positive suggestion
      if (result.redFlags.length === 0) {
        const generalSuggestion = result.negotiationSuggestions.find(
          (s) => s.id === 'general-positive'
        );
        expect(generalSuggestion).toBeDefined();
        expect(generalSuggestion?.priority).toBe('low');
      }
    });
  });

  describe('Multiple red flags scenario', () => {
    it('should generate multiple suggestions for multiple red flags', async () => {
      const request = {
        offerText:
          'Your CTC is 4 LPA. You must sign a service agreement with a 2-year bond. You cannot work with competitors for 1 year after leaving. Notice period is 90 days. Performance bonus can be recovered if you leave early.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 4, // Below market
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      // Should detect multiple red flags
      expect(result.redFlags.length).toBeGreaterThanOrEqual(3);

      // Should have multiple suggestions
      expect(result.negotiationSuggestions.length).toBeGreaterThanOrEqual(4);

      // Should have suggestions for each major red flag
      const suggestionIds = result.negotiationSuggestions.map((s) => s.id);
      expect(suggestionIds).toContain('salary-raise'); // Below market
      expect(suggestionIds).toContain('bond-removal'); // Training bond
      expect(suggestionIds).toContain('non-compete-scope'); // Non-compete
      expect(suggestionIds).toContain('notice-reduction'); // Long notice
    });
  });

  describe('Suggestion structure', () => {
    it('should return suggestions with all required fields', async () => {
      const request = {
        offerText: 'Your CTC is 4 LPA with a 2-year bond.',
        role: 'Software Engineer',
        experience: '1-3 years',
        ctc: 4,
        city: 'Bangalore',
      };

      const result = await analysisService.analyze(request);

      expect(result.negotiationSuggestions.length).toBeGreaterThan(0);

      result.negotiationSuggestions.forEach((suggestion) => {
        expect(suggestion).toHaveProperty('id');
        expect(suggestion).toHaveProperty('category');
        expect(suggestion).toHaveProperty('icon');
        expect(suggestion).toHaveProperty('title');
        expect(suggestion).toHaveProperty('suggestion');
        expect(suggestion).toHaveProperty('priority');

        // Validate priority values
        expect(['high', 'medium', 'low']).toContain(suggestion.priority);

        // Validate fields are non-empty
        expect(suggestion.id).toBeTruthy();
        expect(suggestion.category).toBeTruthy();
        expect(suggestion.icon).toBeTruthy();
        expect(suggestion.title).toBeTruthy();
        expect(suggestion.suggestion).toBeTruthy();
      });
    });
  });
});
