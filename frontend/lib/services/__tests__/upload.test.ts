/**
 * Upload Service Tests
 * 
 * Tests for file upload validation and service functions
 * Requirements: 2.2, 2.3, 2.4, 2.5, 2.6
 */

import { validateFile, getFileTypeDisplay, formatFileSize } from '../upload';

describe('Upload Service', () => {
  describe('validateFile', () => {
    it('should accept valid PDF files', () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('should accept valid image files', () => {
      const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
      
      imageTypes.forEach(type => {
        const file = new File(['test'], `test.${type.split('/')[1]}`, { type });
        const result = validateFile(file);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should accept valid document files', () => {
      const docTypes = [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ];
      
      docTypes.forEach(type => {
        const file = new File(['test'], 'test.doc', { type });
        const result = validateFile(file);
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      });
    });

    it('should reject invalid file types', () => {
      const file = new File(['test'], 'test.exe', { type: 'application/x-msdownload' });
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('Invalid file type');
    });

    it('should reject files larger than 10MB', () => {
      // Create a file larger than 10MB
      const largeContent = new Array(11 * 1024 * 1024).fill('a').join('');
      const file = new File([largeContent], 'large.pdf', { type: 'application/pdf' });
      
      const result = validateFile(file);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('exceeds the maximum limit of 10MB');
    });

    it('should accept files exactly at 10MB limit', () => {
      // Create a file exactly 10MB
      const content = new Array(10 * 1024 * 1024).fill('a').join('');
      const file = new File([content], 'exact.pdf', { type: 'application/pdf' });
      
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });

    it('should accept small files', () => {
      const file = new File(['small content'], 'small.pdf', { type: 'application/pdf' });
      const result = validateFile(file);
      expect(result.valid).toBe(true);
    });
  });

  describe('getFileTypeDisplay', () => {
    it('should return "PDF" for PDF files', () => {
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });
      expect(getFileTypeDisplay(file)).toBe('PDF');
    });

    it('should return "Image" for image files', () => {
      const file = new File(['test'], 'test.jpg', { type: 'image/jpeg' });
      expect(getFileTypeDisplay(file)).toBe('Image');
    });

    it('should return "Word Document" for Word files', () => {
      const file = new File(['test'], 'test.docx', { 
        type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' 
      });
      expect(getFileTypeDisplay(file)).toBe('Word Document');
    });

    it('should return "Text File" for text files', () => {
      const file = new File(['test'], 'test.txt', { type: 'text/plain' });
      expect(getFileTypeDisplay(file)).toBe('Text File');
    });

    it('should return "Document" for unknown types', () => {
      const file = new File(['test'], 'test.unknown', { type: 'application/unknown' });
      expect(getFileTypeDisplay(file)).toBe('Document');
    });
  });

  describe('formatFileSize', () => {
    it('should format bytes correctly', () => {
      expect(formatFileSize(500)).toBe('500 B');
      expect(formatFileSize(1023)).toBe('1023 B');
    });

    it('should format kilobytes correctly', () => {
      expect(formatFileSize(1024)).toBe('1.0 KB');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(10240)).toBe('10.0 KB');
    });

    it('should format megabytes correctly', () => {
      expect(formatFileSize(1024 * 1024)).toBe('1.00 MB');
      expect(formatFileSize(1.5 * 1024 * 1024)).toBe('1.50 MB');
      expect(formatFileSize(10 * 1024 * 1024)).toBe('10.00 MB');
    });

    it('should handle zero bytes', () => {
      expect(formatFileSize(0)).toBe('0 B');
    });
  });
});
