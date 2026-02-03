/**
 * Input sanitization utilities
 * Prevents SQL injection and XSS attacks
 * Requirements: 6.3, 6.4
 */

/**
 * Sanitize text input by removing or escaping dangerous characters
 * Prevents XSS attacks by escaping HTML special characters
 */
export const sanitizeText = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/\//g, '&#x2F;');
};

/**
 * Sanitize HTML by removing script tags and dangerous attributes
 * More aggressive than sanitizeText for user-generated HTML content
 */
export const sanitizeHtml = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove script tags and their content
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    // Remove event handlers (onclick, onerror, etc.)
    .replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/\s*on\w+\s*=\s*[^\s>]*/gi, '')
    // Remove javascript: protocol
    .replace(/javascript:/gi, '')
    // Remove data: protocol (can be used for XSS)
    .replace(/data:text\/html/gi, '')
    // Escape remaining HTML
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
};

/**
 * Remove SQL injection patterns
 * Note: This is a defense-in-depth measure. Primary protection is parameterized queries.
 */
export const sanitizeSql = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  // Remove common SQL injection patterns
  return input
    .replace(/(\b(SELECT|INSERT|UPDATE|DELETE|DROP|CREATE|ALTER|EXEC|EXECUTE|UNION|DECLARE)\b)/gi, '')
    .replace(/--/g, '')
    .replace(/;/g, '')
    .replace(/\/\*/g, '')
    .replace(/\*\//g, '')
    .replace(/xp_/gi, '')
    .replace(/sp_/gi, '');
};

/**
 * Sanitize email address
 * Validates and normalizes email format
 */
export const sanitizeEmail = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  // Basic email validation and normalization
  const email = input.trim().toLowerCase();
  
  // Remove any characters that shouldn't be in an email
  return email.replace(/[^a-z0-9@._+-]/g, '');
};

/**
 * Sanitize filename
 * Removes path traversal attempts and dangerous characters
 */
export const sanitizeFilename = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    // Remove path traversal attempts
    .replace(/\.\./g, '')
    .replace(/\//g, '')
    .replace(/\\/g, '')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove control characters
    .replace(/[\x00-\x1f\x80-\x9f]/g, '')
    // Keep only safe characters
    .replace(/[^a-zA-Z0-9._-]/g, '_');
};

/**
 * Sanitize URL
 * Ensures URL is safe and uses allowed protocols
 */
export const sanitizeUrl = (input: string): string => {
  if (typeof input !== 'string') {
    return '';
  }

  const url = input.trim();

  // Only allow http, https, and mailto protocols
  const allowedProtocols = ['http://', 'https://', 'mailto:'];
  const hasAllowedProtocol = allowedProtocols.some((protocol) => url.toLowerCase().startsWith(protocol));

  if (!hasAllowedProtocol && url.includes(':')) {
    // Has a protocol but not an allowed one
    return '';
  }

  // Remove javascript: and data: protocols
  if (url.toLowerCase().includes('javascript:') || url.toLowerCase().includes('data:')) {
    return '';
  }

  return url;
};

/**
 * Sanitize object by recursively sanitizing all string values
 * Useful for sanitizing entire request bodies
 */
export const sanitizeObject = <T extends Record<string, any>>(obj: T, sanitizer: (s: string) => string = sanitizeText): T => {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  const sanitized: any = Array.isArray(obj) ? [] : {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      const value = obj[key];

      if (typeof value === 'string') {
        sanitized[key] = sanitizer(value);
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = sanitizeObject(value, sanitizer);
      } else {
        sanitized[key] = value;
      }
    }
  }

  return sanitized as T;
};

/**
 * Check if input contains potential XSS patterns
 * Returns true if suspicious patterns are detected
 * Note: This is tuned to avoid false positives from legitimate text content
 */
export const containsXss = (input: string): boolean => {
  if (typeof input !== 'string') {
    return false;
  }

  // More specific patterns that indicate actual XSS attempts
  // Avoid flagging legitimate text that mentions these terms
  const xssPatterns = [
    // Script tags with actual content or attributes
    /<script[^>]*>[\s\S]*?<\/script>/i,
    /<script[^>]+src/i,
    
    // JavaScript protocol in attributes
    /javascript:\s*[^;\s]/i,
    
    // Event handlers with actual code (not just the word "onclick" in text)
    /on\w+\s*=\s*["'][^"']*["']/i,
    /on\w+\s*=\s*[^\s>]+/i,
    
    // Dangerous tags with attributes
    /<iframe[^>]+src/i,
    /<object[^>]+data/i,
    /<embed[^>]+src/i,
    
    // Data URLs with HTML content
    /data:text\/html[,;]/i,
    
    // VBScript protocol
    /vbscript:\s*[^;\s]/i,
  ];

  return xssPatterns.some((pattern) => pattern.test(input));
};

/**
 * Check if input contains potential SQL injection patterns
 * Returns true if suspicious patterns are detected
 * Note: This is tuned to avoid false positives from legitimate text content
 */
export const containsSqlInjection = (input: string): boolean => {
  if (typeof input !== 'string') {
    return false;
  }

  // More specific patterns that indicate actual SQL injection attempts
  // Avoid flagging legitimate text that happens to contain SQL keywords
  const sqlPatterns = [
    // SQL injection with quotes and operators (classic injection)
    /'\s*(OR|AND)\s+'\d+'\s*=\s*'\d+/i,
    /'\s*(OR|AND)\s+\d+\s*=\s*\d+/i,
    /'\s*OR\s+'?1'?\s*=\s*'?1/i,
    
    // Union-based injection
    /UNION\s+(ALL\s+)?SELECT/i,
    
    // Comment-based injection (SQL comments used to bypass logic)
    /--\s*$/m,  // SQL comment at end of line
    /\/\*.*\*\/.*(\bSELECT\b|\bINSERT\b|\bUPDATE\b|\bDELETE\b)/i,
    
    // Stacked queries (semicolon followed by SQL command)
    /;\s*(\bDROP\b|\bDELETE\b|\bINSERT\b|\bUPDATE\b|\bCREATE\b)/i,
    
    // Time-based blind injection
    /\b(SLEEP|WAITFOR|DELAY)\s*\(/i,
    
    // Boolean-based blind injection with quotes
    /'\s*=\s*'\s*(OR|AND)/i,
  ];

  return sqlPatterns.some((pattern) => pattern.test(input));
};
