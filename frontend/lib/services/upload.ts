/**
 * Upload Service
 * 
 * Handles file upload operations with validation and progress tracking
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6
 * Requirement 6.3: Display specific error messages for upload failures
 */

import { extractText } from '@/lib/api/endpoints';
import type { UploadProgress, TextExtractionResponse } from '@/lib/api/types';
import { logError } from '@/lib/utils/error-logger';

/**
 * File validation result
 */
export interface FileValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Upload options
 */
export interface UploadServiceOptions {
  onProgress?: (progress: UploadProgress) => void;
  signal?: AbortSignal;
}

/**
 * Supported file types
 */
const SUPPORTED_FILE_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
];

/**
 * Maximum file size in bytes (10MB)
 * Requirement 2.3: Reject files larger than 10MB
 */
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/**
 * Validate file type and size
 * Requirements: 2.2, 2.3
 * 
 * @param file - File to validate
 * @returns Validation result with error message if invalid
 */
export function validateFile(file: File): FileValidationResult {
  // Check file type
  // Requirement 2.2: Accept valid files (PDF or image)
  if (!SUPPORTED_FILE_TYPES.includes(file.type)) {
    return {
      valid: false,
      error: 'Invalid file type. Please upload a PDF, image (JPG, PNG, WebP), DOC, or TXT file.',
    };
  }

  // Check file size
  // Requirement 2.3: Reject files larger than 10MB
  if (file.size > MAX_FILE_SIZE) {
    const sizeMB = (file.size / (1024 * 1024)).toFixed(2);
    return {
      valid: false,
      error: `File size (${sizeMB}MB) exceeds the maximum limit of 10MB. Please upload a smaller file.`,
    };
  }

  return { valid: true };
}

/**
 * Upload and extract text from file
 * Requirements: 2.4, 2.5, 2.6
 * 
 * @param file - File to upload
 * @param options - Upload options including progress callback
 * @returns Extracted text response
 * @throws Error if upload fails
 */
export async function uploadOfferLetter(
  file: File,
  options?: UploadServiceOptions
): Promise<TextExtractionResponse> {
  // Validate file before upload
  const validation = validateFile(file);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  try {
    // Requirement 2.4: Display progress indicator during upload
    const response = await extractText(file, options?.onProgress);

    // Check if extraction was successful
    if (!response.success) {
      // Requirement 2.6: Display error message on failure
      const errorMessage = response.error || 'Failed to extract text from file';
      const error = new Error(errorMessage);

      // Log upload error
      logError(error, {
        component: 'Upload Service',
        action: 'uploadOfferLetter',
        metadata: {
          fileName: file.name,
          fileSize: file.size,
          fileType: file.type,
        },
      });

      throw error;
    }

    return response;
  } catch (error) {
    // Requirement 2.6: Handle upload failures with specific error messages
    // Requirement 6.3: Display specific reasons for upload failure
    if (error instanceof Error) {
      // Log the error if not already logged
      if (!error.message.includes('Failed to extract text')) {
        logError(error, {
          component: 'Upload Service',
          action: 'uploadOfferLetter',
          metadata: {
            fileName: file.name,
            fileSize: file.size,
            fileType: file.type,
          },
        });
      }
      throw error;
    }

    const unexpectedError = new Error('An unexpected error occurred during file upload');
    logError(unexpectedError, {
      component: 'Upload Service',
      action: 'uploadOfferLetter',
      metadata: {
        fileName: file.name,
        originalError: String(error),
      },
    });

    throw unexpectedError;
  }
}

/**
 * Get file type display name
 * 
 * @param file - File to get type for
 * @returns Human-readable file type
 */
export function getFileTypeDisplay(file: File): string {
  const type = file.type;

  if (type === 'application/pdf') return 'PDF';
  if (type.startsWith('image/')) return 'Image';
  if (type.includes('word')) return 'Word Document';
  if (type === 'text/plain') return 'Text File';

  return 'Document';
}

/**
 * Format file size for display
 * 
 * @param bytes - File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
