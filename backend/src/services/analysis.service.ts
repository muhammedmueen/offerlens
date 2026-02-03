import { PrismaClient } from '@prisma/client';
import { cacheService } from './cache.service';
import logger from '../utils/logger';

const prisma = new PrismaClient();

// Types for Analysis Engine
export interface DetectedRedFlag {
  id: string;
  ruleId: string;
  severity: 'high' | 'medium' | 'low';
  title: string;
  description: string;
  matchedKeyword: string;
  excerpt: string;
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
  category: string;
  icon: string;
  title: string;
  suggestion: string;
  priority: 'high' | 'medium' | 'low';
}

export interface AnalysisRequest {
  offerText: string;
  role: string;
  experience: string;
  ctc: number;
  city: string;
}

export interface AnalysisResponse {
  redFlags: DetectedRedFlag[];
  salaryComparison: SalaryComparison;
  takeHome: number;
  negotiationSuggestions: NegotiationSuggestion[];
  analysisId: string;
}

class AnalysisService {
  private readonly CACHE_TTL = 3600; // 1 hour
  private readonly RED_FLAG_CACHE_KEY = 'red_flag_rules:active';

  /**
   * Main analysis method
   * Requirements: 1.2, 2.1, 2.2, 2.3
   */
  async analyze(request: AnalysisRequest): Promise<AnalysisResponse> {
    logger.info('Starting offer analysis', {
      role: request.role,
      experience: request.experience,
      city: request.city,
    });

    // Detect red flags
    const redFlags = await this.detectRedFlags(request.offerText);

    // Compare salary
    const salaryComparison = await this.compareSalary(
      request.role,
      request.experience,
      request.ctc,
      request.city
    );

    // Calculate take-home
    const takeHome = this.calculateTakeHome(request.ctc);

    // Generate negotiation suggestions
    const negotiationSuggestions = this.generateSuggestions(
      redFlags,
      salaryComparison
    );

    // Generate temporary analysis ID (not stored)
    const analysisId = this.generateAnalysisId();

    logger.info('Analysis completed', {
      analysisId,
      redFlagsCount: redFlags.length,
      salaryComparison: salaryComparison.comparison,
    });

    return {
      redFlags,
      salaryComparison,
      takeHome,
      negotiationSuggestions,
      analysisId,
    };
  }

  /**
   * Detect red flags using pattern matching against database rules
   * Requirements: 4.1, 4.3, 4.4
   */
  async detectRedFlags(offerText: string): Promise<DetectedRedFlag[]> {
    // Get active red flag rules from cache or database
    const rules = await this.getActiveRedFlagRules();

    const normalizedText = offerText.toLowerCase();
    const detectedFlags: DetectedRedFlag[] = [];

    for (const rule of rules) {
      for (const keyword of rule.keywords) {
        const normalizedKeyword = keyword.toLowerCase();
        if (normalizedText.includes(normalizedKeyword)) {
          // Extract excerpt around the matched keyword
          const excerpt = this.extractExcerpt(offerText, keyword);

          detectedFlags.push({
            id: rule.id,
            ruleId: rule.ruleId,
            severity: rule.severity as 'high' | 'medium' | 'low',
            title: rule.title,
            description: rule.description,
            matchedKeyword: keyword,
            excerpt,
          });
          break; // Only add each rule once
        }
      }
    }

    // Sort by severity: high -> medium -> low
    const severityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return detectedFlags.sort(
      (a, b) => severityOrder[a.severity] - severityOrder[b.severity]
    );
  }

  /**
   * Extract text excerpt around matched keyword
   * Requirements: 4.3
   */
  private extractExcerpt(text: string, keyword: string, contextLength = 100): string {
    const normalizedText = text.toLowerCase();
    const normalizedKeyword = keyword.toLowerCase();
    const index = normalizedText.indexOf(normalizedKeyword);

    if (index === -1) return '';

    const start = Math.max(0, index - contextLength);
    const end = Math.min(text.length, index + keyword.length + contextLength);

    let excerpt = text.substring(start, end).trim();

    // Add ellipsis if truncated
    if (start > 0) excerpt = '...' + excerpt;
    if (end < text.length) excerpt = excerpt + '...';

    return excerpt;
  }

  /**
   * Get active red flag rules from cache or database
   */
  private async getActiveRedFlagRules() {
    // Try to get from cache first
    const cached = await cacheService.get<any[]>(this.RED_FLAG_CACHE_KEY);
    if (cached) {
      logger.debug('Red flag rules retrieved from cache');
      return cached;
    }

    // Fetch from database
    const rules = await prisma.redFlagRule.findMany({
      where: { active: true },
      select: {
        id: true,
        ruleId: true,
        severity: true,
        title: true,
        description: true,
        keywords: true,
      },
    });

    // Cache for future requests
    await cacheService.set(this.RED_FLAG_CACHE_KEY, rules, this.CACHE_TTL);

    logger.debug('Red flag rules retrieved from database and cached');
    return rules;
  }

  /**
   * Compare offered salary against market benchmarks
   * Requirements: 5.1, 5.3
   */
  async compareSalary(
    role: string,
    experience: string,
    ctc: number,
    city: string
  ): Promise<SalaryComparison> {
    // Get salary benchmark from cache or database
    const benchmark = await this.getSalaryBenchmark(role, experience, city);

    if (!benchmark) {
      logger.warn('No salary benchmark found', { role, experience, city });
      return {
        range: { min: 0, avg: 0, max: 0 },
        comparison: 'aligned',
        difference: 0,
        message: 'No market data available for comparison',
      };
    }

    const range: SalaryRange = {
      min: Number(benchmark.minSalary),
      avg: Number(benchmark.avgSalary),
      max: Number(benchmark.maxSalary),
    };

    const difference = ctc - range.avg;
    const threshold = range.avg * 0.1; // 10% threshold for "aligned"

    let comparison: 'below' | 'aligned' | 'above';
    let message: string;

    if (ctc < range.avg - threshold) {
      comparison = 'below';
      message = `Your offer is below market average by ${Math.abs(difference).toFixed(1)} LPA`;
    } else if (ctc > range.avg + threshold) {
      comparison = 'above';
      message = `Your offer exceeds market average by ${difference.toFixed(1)} LPA`;
    } else {
      comparison = 'aligned';
      message = 'Your offer is aligned with market standards';
    }

    return { range, comparison, difference, message };
  }

  /**
   * Get salary benchmark from cache or database
   */
  /**
   * Normalize experience to match database format
   */
  private normalizeExperience(experience: string): string {
    const exp = parseInt(experience);
    if (isNaN(exp)) return experience; // Return as-is if not a number
    
    if (exp <= 1) return '0-1 years';
    if (exp <= 3) return '1-3 years';
    if (exp <= 5) return '3-5 years';
    if (exp <= 8) return '5-8 years';
    return '8+ years';
  }

  /**
   * Normalize role to match database format (title case)
   */
  private normalizeRole(role: string): string {
    return role
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(' ');
  }

  private async getSalaryBenchmark(role: string, experience: string, city: string) {
    // Normalize inputs
    const normalizedRole = this.normalizeRole(role);
    const normalizedExperience = this.normalizeExperience(experience);
    
    const cacheKey = `salary:${normalizedRole}:${normalizedExperience}:${city}`;

    // Try cache first
    const cached = await cacheService.get<any>(cacheKey);
    if (cached) {
      logger.debug('Salary benchmark retrieved from cache');
      return cached;
    }

    // Fetch from database - get most recent benchmark
    const benchmark = await prisma.salaryBenchmark.findFirst({
      where: {
        role: normalizedRole,
        experienceLevel: normalizedExperience,
        city,
      },
      orderBy: {
        effectiveDate: 'desc',
      },
    });

    if (benchmark) {
      // Cache for future requests
      await cacheService.set(cacheKey, benchmark, this.CACHE_TTL);
      logger.debug('Salary benchmark retrieved from database and cached');
    } else {
      logger.warn('No salary benchmark found', {
        role: normalizedRole,
        experience: normalizedExperience,
        city,
      });
    }

    return benchmark;
  }

  /**
   * Calculate take-home salary (approximate)
   */
  private calculateTakeHome(ctc: number): number {
    // Approximate: 70% of CTC as take-home, converted to monthly
    return Math.round((ctc * 0.7 * 100000) / 12);
  }

  /**
   * Generate negotiation suggestions based on red flags and salary comparison
   * Requirements: 4.1
   */
  private generateSuggestions(
    redFlags: DetectedRedFlag[],
    salaryComparison: SalaryComparison
  ): NegotiationSuggestion[] {
    const suggestions: NegotiationSuggestion[] = [];

    // Salary-based suggestions
    if (salaryComparison.comparison === 'below') {
      const targetRaise = Math.abs(salaryComparison.difference).toFixed(1);
      suggestions.push({
        id: 'salary-raise',
        category: 'Compensation',
        icon: '💰',
        title: 'Request Salary Adjustment',
        suggestion: `Ask for a raise of ${targetRaise} LPA to match industry standards. Present market data showing the average for your role is ${salaryComparison.range.avg} LPA.`,
        priority: 'high',
      });
    } else if (salaryComparison.comparison === 'above') {
      suggestions.push({
        id: 'salary-leverage',
        category: 'Leverage',
        icon: '⭐',
        title: 'Strong Position',
        suggestion: `Your offer exceeds market average. Use this as a foundation to negotiate other terms like flexibility, signing bonus, or faster review cycles.`,
        priority: 'low',
      });
    }

    // Red flag based suggestions
    const flagIds = new Set(redFlags.map((f) => f.ruleId));

    if (flagIds.has('training-bond')) {
      suggestions.push({
        id: 'bond-removal',
        category: 'Contractual Terms',
        icon: '🔓',
        title: 'Address Training Bond',
        suggestion:
          'Seek removal of the bond clause or request clear documentation of penalty terms. Ask for pro-rata reduction of penalty based on service duration.',
        priority: 'high',
      });
    }

    if (flagIds.has('non-compete')) {
      suggestions.push({
        id: 'non-compete-scope',
        category: 'Contractual Terms',
        icon: '📋',
        title: 'Limit Non-Compete Scope',
        suggestion:
          'Request scope reduction (geography, duration, competitor definition) or written relaxation. Some non-compete clauses may not be enforceable in your jurisdiction.',
        priority: 'high',
      });
    }

    if (flagIds.has('bonus-clawback')) {
      suggestions.push({
        id: 'bonus-terms',
        category: 'Compensation',
        icon: '🎯',
        title: 'Clarify Bonus Terms',
        suggestion:
          'Request clear documentation of conditions under which bonus repayment applies. Negotiate for pro-rata forfeiture instead of full clawback.',
        priority: 'high',
      });
    }

    if (flagIds.has('long-notice')) {
      suggestions.push({
        id: 'notice-reduction',
        category: 'Exit Terms',
        icon: '📅',
        title: 'Negotiate Notice Period',
        suggestion:
          'Negotiate for a 30-60 day notice period, or request a buyout clause that allows early exit by paying for remaining notice days.',
        priority: 'medium',
      });
    }

    if (flagIds.has('high-variable')) {
      suggestions.push({
        id: 'variable-fixed',
        category: 'Compensation',
        icon: '📊',
        title: 'Optimize Pay Structure',
        suggestion:
          'Request shifting 10-20% of variable pay into fixed components. This ensures more predictable monthly income.',
        priority: 'medium',
      });
    }

    if (flagIds.has('extended-probation')) {
      suggestions.push({
        id: 'probation-reduction',
        category: 'Terms',
        icon: '⏱️',
        title: 'Reduce Probation Period',
        suggestion:
          'Request a standard 3-month probation or ask for clear performance criteria for early confirmation.',
        priority: 'medium',
      });
    }

    if (flagIds.has('reimbursement-heavy')) {
      suggestions.push({
        id: 'reimbursement-fixed',
        category: 'Compensation',
        icon: '💵',
        title: 'Convert Reimbursements',
        suggestion:
          'Ask for more fixed salary instead of reimbursement-heavy structure. Reimbursements require expense claims and may not be fully utilized.',
        priority: 'low',
      });
    }

    if (flagIds.has('gratuity-included')) {
      suggestions.push({
        id: 'gratuity-separate',
        category: 'Compensation',
        icon: '📝',
        title: 'Request CTC Restructuring',
        suggestion:
          'Ask for CTC breakdown excluding gratuity, as it\'s a statutory benefit. This gives a clearer picture of your actual compensation.',
        priority: 'low',
      });
    }

    // If no suggestions, add a general one
    if (suggestions.length === 0) {
      suggestions.push({
        id: 'general-positive',
        category: 'General',
        icon: '✨',
        title: 'Clean Offer',
        suggestion:
          'Your offer appears to have no major red flags. You can still negotiate for better terms like signing bonus, flexible work arrangements, or learning & development budget.',
        priority: 'low',
      });
    }

    // Sort by priority
    const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
    return suggestions.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Generate temporary analysis ID (not stored in database)
   */
  private generateAnalysisId(): string {
    return `analysis_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Invalidate red flag rules cache (called when rules are updated)
   */
  async invalidateRedFlagCache(): Promise<void> {
    await cacheService.del(this.RED_FLAG_CACHE_KEY);
    logger.info('Red flag rules cache invalidated');
  }

  /**
   * Invalidate salary benchmark cache (called when benchmarks are updated)
   */
  async invalidateSalaryCache(role?: string, experience?: string, city?: string): Promise<void> {
    if (role && experience && city) {
      const cacheKey = `salary:${role}:${experience}:${city}`;
      await cacheService.del(cacheKey);
      logger.info('Salary benchmark cache invalidated', { role, experience, city });
    } else {
      // If no specific params, we'd need to clear all salary keys
      // For now, just log - in production, consider using cache key patterns
      logger.info('Salary benchmark cache invalidation requested (all)');
    }
  }
}

export const analysisService = new AnalysisService();
export default AnalysisService;
