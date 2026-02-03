import { Request, Response, NextFunction } from 'express';
import metadataService from '../services/metadata.service';
import logger from '../utils/logger';

/**
 * MetadataController handles requests for system metadata
 * 
 * Requirements: 5.1 - Provide metadata endpoints for salary benchmarks
 */

/**
 * GET /api/v1/roles
 * Get all available roles
 */
export const getRoles = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const roles = await metadataService.getRoles();

    res.status(200).json({
      success: true,
      data: roles,
      count: roles.length,
    });
  } catch (error) {
    logger.error('Error in getRoles controller:', error);
    next(error);
  }
};

/**
 * GET /api/v1/experience-levels
 * Get all available experience levels
 */
export const getExperienceLevels = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const levels = await metadataService.getExperienceLevels();

    res.status(200).json({
      success: true,
      data: levels,
      count: levels.length,
    });
  } catch (error) {
    logger.error('Error in getExperienceLevels controller:', error);
    next(error);
  }
};

/**
 * GET /api/v1/cities
 * Get all available cities
 */
export const getCities = async (
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const cities = await metadataService.getCities();

    res.status(200).json({
      success: true,
      data: cities,
      count: cities.length,
    });
  } catch (error) {
    logger.error('Error in getCities controller:', error);
    next(error);
  }
};
