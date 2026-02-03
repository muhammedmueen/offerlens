/**
 * Error Logging Utility
 * 
 * Centralized error logging for debugging and monitoring
 * Requirement 6.5: Implement error logging
 */

export interface ErrorLogContext {
  component?: string
  action?: string
  userId?: string
  metadata?: Record<string, unknown>
}

export interface ErrorLog {
  timestamp: string
  message: string
  stack?: string
  context?: ErrorLogContext
  environment: string
}

/**
 * Log error to console and external services
 */
export function logError(error: Error, context?: ErrorLogContext): void {
  const errorLog: ErrorLog = {
    timestamp: new Date().toISOString(),
    message: error.message,
    stack: error.stack,
    context,
    environment: process.env.NODE_ENV || "development",
  }

  // Always log to console
  console.error("[Error Logger]", errorLog)

  // In production, send to error tracking service
  if (process.env.NODE_ENV === "production") {
    // TODO: Integrate with error tracking service (e.g., Sentry)
    // Example:
    // Sentry.captureException(error, {
    //   contexts: {
    //     custom: context,
    //   },
    // })
    
    // For now, we can use a simple API endpoint or localStorage
    try {
      // Store in localStorage for debugging (temporary solution)
      const existingLogs = getStoredErrors()
      existingLogs.push(errorLog)
      
      // Keep only last 50 errors
      const recentLogs = existingLogs.slice(-50)
      localStorage.setItem("error_logs", JSON.stringify(recentLogs))
    } catch (storageError) {
      // Silently fail if localStorage is not available
      console.warn("Failed to store error log:", storageError)
    }
  }
}

/**
 * Log API error with additional context
 */
export function logAPIError(
  error: Error,
  endpoint: string,
  method: string,
  statusCode?: number
): void {
  logError(error, {
    component: "API Client",
    action: `${method} ${endpoint}`,
    metadata: {
      statusCode,
      endpoint,
      method,
    },
  })
}

/**
 * Log component error
 */
export function logComponentError(
  error: Error,
  componentName: string,
  action?: string
): void {
  logError(error, {
    component: componentName,
    action,
  })
}

/**
 * Get stored error logs from localStorage
 */
export function getStoredErrors(): ErrorLog[] {
  try {
    const logs = localStorage.getItem("error_logs")
    return logs ? JSON.parse(logs) : []
  } catch {
    return []
  }
}

/**
 * Clear stored error logs
 */
export function clearStoredErrors(): void {
  try {
    localStorage.removeItem("error_logs")
  } catch (error) {
    console.warn("Failed to clear error logs:", error)
  }
}

/**
 * Get error logs for debugging (development only)
 */
export function getErrorLogsForDebug(): ErrorLog[] {
  if (process.env.NODE_ENV !== "development") {
    console.warn("Error logs are only available in development mode")
    return []
  }
  return getStoredErrors()
}

/**
 * Format error for display
 */
export function formatErrorMessage(error: Error | unknown): string {
  if (error instanceof Error) {
    return error.message
  }
  
  if (typeof error === "string") {
    return error
  }
  
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message)
  }
  
  return "An unexpected error occurred"
}

/**
 * Check if error is a network error
 */
export function isNetworkError(error: Error): boolean {
  return (
    error.message.includes("network") ||
    error.message.includes("fetch") ||
    error.message.includes("connection") ||
    error.name === "NetworkError"
  )
}

/**
 * Check if error is an authentication error
 */
export function isAuthError(error: Error): boolean {
  return (
    error.message.includes("401") ||
    error.message.includes("unauthorized") ||
    error.message.includes("authentication")
  )
}

/**
 * Check if error is a server error
 */
export function isServerError(error: Error): boolean {
  return (
    error.message.includes("500") ||
    error.message.includes("502") ||
    error.message.includes("503") ||
    error.message.includes("504") ||
    error.message.includes("server error")
  )
}

export default {
  logError,
  logAPIError,
  logComponentError,
  getStoredErrors,
  clearStoredErrors,
  getErrorLogsForDebug,
  formatErrorMessage,
  isNetworkError,
  isAuthError,
  isServerError,
}
