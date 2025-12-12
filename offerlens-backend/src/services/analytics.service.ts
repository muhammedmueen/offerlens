import crypto from 'crypto';
import prisma from '../lib/prisma';
import logger from '../utils/logger';

/**
 * Analytics Service
 * Handles anonymized event tracking for usage metrics
 * Requirements: 2.4, 8.1
 */

export interface AnalyticsEventData {
  eventType: string;
  metadata?: Record<string, any>;
  ipAddress?: string;
}

/**
 * Hash IP address for privacy-compliant storage
 * Requirements: 2.4
 */
export const hashIpAddress = (ip: string | undefined): string | null => {
  if (!ip) return null;
  return crypto.createHash('sha256').update(ip).digest('hex');
};

/**
 * Log an analytics event with anonymized data
 * Requirements: 2.4, 8.1
 * 
 * @param eventData - Event data including type, metadata, and optional IP
 * @returns Promise<void>
 */
export const logAnalyticsEvent = async (eventData: AnalyticsEventData): Promise<void> => {
  try {
    // Hash IP address before storing
    const ipAddressHash = hashIpAddress(eventData.ipAddress);

    // Sanitize metadata to ensure no PII is stored
    const sanitizedMetadata = sanitizeMetadata(eventData.metadata);

    await prisma.analyticsEvent.create({
      data: {
        eventType: eventData.eventType,
        metadata: sanitizedMetadata || undefined,
        ipAddressHash,
      },
    });

    logger.info('Analytics event logged', {
      eventType: eventData.eventType,
      hasMetadata: !!sanitizedMetadata,
      hasIpHash: !!ipAddressHash,
    });
  } catch (error) {
    // Don't throw - analytics failures shouldn't break the app
    logger.error('Failed to log analytics event', {
      eventType: eventData.eventType,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

/**
 * Sanitize metadata to remove any potential PII
 * Requirements: 2.4
 */
const sanitizeMetadata = (metadata?: Record<string, any>): Record<string, any> | null => {
  if (!metadata) return null;

  const sanitized: Record<string, any> = {};
  const piiFields = ['email', 'name', 'phone', 'address', 'offerText', 'text', 'content'];

  for (const [key, value] of Object.entries(metadata)) {
    // Skip fields that might contain PII
    if (piiFields.some(field => key.toLowerCase().includes(field.toLowerCase()))) {
      continue;
    }

    // Only include primitive types and simple objects
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      sanitized[key] = value;
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      // Recursively sanitize nested objects
      const nestedSanitized = sanitizeMetadata(value);
      if (nestedSanitized && Object.keys(nestedSanitized).length > 0) {
        sanitized[key] = nestedSanitized;
      }
    }
  }

  return Object.keys(sanitized).length > 0 ? sanitized : null;
};

/**
 * Common event types for consistency
 */
export const EventTypes = {
  ANALYSIS_REQUESTED: 'analysis_requested',
  ANALYSIS_COMPLETED: 'analysis_completed',
  ANALYSIS_FAILED: 'analysis_failed',
  OCR_REQUESTED: 'ocr_requested',
  OCR_COMPLETED: 'ocr_completed',
  OCR_FAILED: 'ocr_failed',
  FEATURE_REQUEST_SUBMITTED: 'feature_request_submitted',
  FEATURE_REQUEST_VOTED: 'feature_request_voted',
  ADMIN_LOGIN: 'admin_login',
  ADMIN_DATA_UPDATE: 'admin_data_update',
} as const;

export default {
  logAnalyticsEvent,
  hashIpAddress,
  EventTypes,
};
