import { Request, Response, NextFunction } from 'express';
import { analysisService } from '../services';
import logger from '../utils/logger';

/**
 * Analysis Controller
 * Handles offer analysis requests
 * Requirements: 1.2, 2.1, 2.2, 2.3
 */

/**
 * POST /api/v1/analyze
 * Analyze an offer letter
 */
export const analyzeOffer = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { offerText, role, experience, ctc, city } = req.body;

    logger.info('Received analysis request', {
      role,
      experience,
      city,
      offerTextLength: offerText.length,
      requestId: req.headers['x-request-id'],
    });

    // Perform analysis (stateless - no data persisted)
    const result = await analysisService.analyze({
      offerText,
      role,
      experience,
      ctc,
      city,
    });

    logger.info('Analysis completed successfully', {
      analysisId: result.analysisId,
      redFlagsCount: result.redFlags.length,
      salaryComparison: result.salaryComparison.comparison,
      requestId: req.headers['x-request-id'],
    });

    // Return analysis results
    res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error) {
    logger.error('Error during analysis', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });
    next(error);
  }
};
