import { Request, Response, NextFunction } from 'express';
import { featureRequestService } from '../services';
import logger from '../utils/logger';

/**
 * Feature Request Controller
 * Handles feature request operations
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 14.2, 14.3
 */

/**
 * POST /api/v1/feature-requests
 * Submit a new feature request
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export const createFeatureRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { type, title, description, userEmail } = req.body;

    logger.info('Received feature request submission', {
      type,
      title,
      hasEmail: !!userEmail,
      requestId: req.headers['x-request-id'],
    });

    // Create feature request
    const featureRequest = await featureRequestService.create({
      type,
      title,
      description,
      userEmail,
    });

    // TODO: Send email notification to admins (Requirements 3.4)
    // This will be implemented when email service is set up
    logger.info('Feature request created (email notification pending)', {
      id: featureRequest.id,
    });

    res.status(201).json({
      success: true,
      data: {
        id: featureRequest.id,
        type: featureRequest.type,
        title: featureRequest.title,
        description: featureRequest.description,
        status: featureRequest.status,
        votes: featureRequest.votes,
        createdAt: featureRequest.createdAt,
      },
      message: 'Feature request submitted successfully',
    });
  } catch (error) {
    logger.error('Error creating feature request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });
    next(error);
  }
};

/**
 * GET /api/v1/feature-requests
 * List feature requests with filtering and pagination
 * Requirements: 14.2
 */
export const listFeatureRequests = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { status, type, page, limit } = req.query;

    logger.info('Received feature request list query', {
      status,
      type,
      page,
      limit,
      requestId: req.headers['x-request-id'],
    });

    const result = await featureRequestService.findAll({
      status: status as string | undefined,
      type: type as string | undefined,
      page: page ? parseInt(page as string, 10) : undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
    });

    res.status(200).json({
      success: true,
      data: result.data,
      pagination: result.pagination,
    });
  } catch (error) {
    logger.error('Error listing feature requests', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });
    next(error);
  }
};

/**
 * GET /api/v1/feature-requests/:id
 * Get a single feature request by ID
 * Requirements: 14.2
 */
export const getFeatureRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    logger.info('Received feature request get query', {
      id,
      requestId: req.headers['x-request-id'],
    });

    const featureRequest = await featureRequestService.findById(id);

    if (!featureRequest) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Feature request not found',
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: featureRequest,
    });
  } catch (error) {
    logger.error('Error getting feature request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });
    next(error);
  }
};

/**
 * POST /api/v1/feature-requests/:id/vote
 * Vote for a feature request
 * Requirements: 14.3
 */
export const voteFeatureRequest = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;
    const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';

    logger.info('Received vote request', {
      id,
      ipAddress,
      requestId: req.headers['x-request-id'],
    });

    // Check if feature request exists
    const featureRequest = await featureRequestService.findById(id);
    if (!featureRequest) {
      res.status(404).json({
        success: false,
        error: {
          code: 'NOT_FOUND',
          message: 'Feature request not found',
        },
      });
      return;
    }

    // Record vote
    const result = await featureRequestService.vote(id, ipAddress);

    if (!result.success) {
      res.status(409).json({
        success: false,
        error: {
          code: 'DUPLICATE_VOTE',
          message: result.message,
        },
      });
      return;
    }

    res.status(200).json({
      success: true,
      message: result.message,
    });
  } catch (error) {
    logger.error('Error voting for feature request', {
      error: error instanceof Error ? error.message : 'Unknown error',
      requestId: req.headers['x-request-id'],
    });
    next(error);
  }
};

