import { PrismaClient } from '@prisma/client';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

/**
 * Feature Request Service
 * Handles feature request operations
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 14.2, 14.3
 */

export interface CreateFeatureRequestDTO {
  type: 'role' | 'feature' | 'issue';
  title: string;
  description: string;
  userEmail?: string;
}

export interface FeatureRequestFilters {
  status?: string;
  type?: string;
  page?: number;
  limit?: number;
}

export interface PaginatedFeatureRequests {
  data: any[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

class FeatureRequestService {
  private prisma: PrismaClient;

  constructor() {
    this.prisma = prisma;
  }

  /**
   * Create a new feature request
   * Requirements: 3.3
   */
  async create(data: CreateFeatureRequestDTO) {
    try {
      const featureRequest = await this.prisma.featureRequest.create({
        data: {
          type: data.type,
          title: data.title,
          description: data.description,
          userEmail: data.userEmail,
          status: 'submitted',
          votes: 0,
        },
      });

      logger.info('Feature request created', {
        id: featureRequest.id,
        type: featureRequest.type,
        title: featureRequest.title,
      });

      return featureRequest;
    } catch (error) {
      logger.error('Error creating feature request', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find all feature requests with optional filtering and pagination
   * Requirements: 14.2
   */
  async findAll(filters: FeatureRequestFilters = {}): Promise<PaginatedFeatureRequests> {
    try {
      const { status, type, page = 1, limit = 20 } = filters;
      const skip = (page - 1) * limit;

      // Build where clause
      const where: any = {};
      if (status) where.status = status;
      if (type) where.type = type;

      // Get total count
      const total = await this.prisma.featureRequest.count({ where });

      // Get paginated results
      const data = await this.prisma.featureRequest.findMany({
        where,
        orderBy: [
          { status: 'asc' }, // Show active statuses first
          { votes: 'desc' }, // Then by votes
          { createdAt: 'desc' }, // Then by date
        ],
        skip,
        take: limit,
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          status: true,
          votes: true,
          createdAt: true,
          updatedAt: true,
          // Don't expose userEmail or adminNote in public listing
        },
      });

      logger.info('Feature requests retrieved', {
        count: data.length,
        total,
        filters,
      });

      return {
        data,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Error finding feature requests', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find a feature request by ID
   * Requirements: 3.3
   */
  async findById(id: string) {
    try {
      const featureRequest = await this.prisma.featureRequest.findUnique({
        where: { id },
        select: {
          id: true,
          type: true,
          title: true,
          description: true,
          status: true,
          votes: true,
          createdAt: true,
          updatedAt: true,
          // Don't expose userEmail or adminNote in public view
        },
      });

      if (!featureRequest) {
        logger.warn('Feature request not found', { id });
        return null;
      }

      logger.info('Feature request retrieved', { id });
      return featureRequest;
    } catch (error) {
      logger.error('Error finding feature request by ID', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update feature request status (admin only)
   * Requirements: 14.4, 14.5
   */
  async updateStatus(id: string, status: string, adminNote?: string) {
    try {
      const featureRequest = await this.prisma.featureRequest.update({
        where: { id },
        data: {
          status,
          adminNote,
          updatedAt: new Date(),
        },
      });

      logger.info('Feature request status updated', {
        id,
        status,
        hasAdminNote: !!adminNote,
      });

      return featureRequest;
    } catch (error) {
      logger.error('Error updating feature request status', {
        id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Vote for a feature request
   * Requirements: 14.3
   */
  async vote(featureRequestId: string, ipAddress: string) {
    try {
      // Check if IP has already voted
      const existingVote = await this.prisma.featureRequestVote.findUnique({
        where: {
          featureRequestId_ipAddress: {
            featureRequestId,
            ipAddress,
          },
        },
      });

      if (existingVote) {
        logger.warn('Duplicate vote attempt', { featureRequestId, ipAddress });
        return { success: false, message: 'You have already voted for this request' };
      }

      // Create vote record and increment vote count in a transaction
      await this.prisma.$transaction([
        this.prisma.featureRequestVote.create({
          data: {
            featureRequestId,
            ipAddress,
          },
        }),
        this.prisma.featureRequest.update({
          where: { id: featureRequestId },
          data: {
            votes: {
              increment: 1,
            },
          },
        }),
      ]);

      logger.info('Vote recorded', { featureRequestId, ipAddress });
      return { success: true, message: 'Vote recorded successfully' };
    } catch (error) {
      logger.error('Error recording vote', {
        featureRequestId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

export const featureRequestService = new FeatureRequestService();

