import { hashIpAddress, EventTypes } from '../analytics.service';

/**
 * Analytics Service Tests
 * Tests for anonymized event tracking
 * Requirements: 2.4, 8.1
 */

describe('Analytics Service', () => {
  describe('hashIpAddress', () => {
    it('should hash IP address consistently', () => {
      const ip = '192.168.1.1';
      const hash1 = hashIpAddress(ip);
      const hash2 = hashIpAddress(ip);

      expect(hash1).toBe(hash2);
      expect(hash1).not.toBe(ip);
      expect(hash1).toHaveLength(64); // SHA-256 produces 64 character hex string
    });

    it('should return null for undefined IP', () => {
      const hash = hashIpAddress(undefined);
      expect(hash).toBeNull();
    });

    it('should produce different hashes for different IPs', () => {
      const hash1 = hashIpAddress('192.168.1.1');
      const hash2 = hashIpAddress('192.168.1.2');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('EventTypes', () => {
    it('should have all required event types', () => {
      expect(EventTypes.ANALYSIS_REQUESTED).toBe('analysis_requested');
      expect(EventTypes.ANALYSIS_COMPLETED).toBe('analysis_completed');
      expect(EventTypes.ANALYSIS_FAILED).toBe('analysis_failed');
      expect(EventTypes.OCR_REQUESTED).toBe('ocr_requested');
      expect(EventTypes.OCR_COMPLETED).toBe('ocr_completed');
      expect(EventTypes.OCR_FAILED).toBe('ocr_failed');
      expect(EventTypes.FEATURE_REQUEST_SUBMITTED).toBe('feature_request_submitted');
      expect(EventTypes.FEATURE_REQUEST_VOTED).toBe('feature_request_voted');
      expect(EventTypes.ADMIN_LOGIN).toBe('admin_login');
      expect(EventTypes.ADMIN_DATA_UPDATE).toBe('admin_data_update');
    });
  });
});
