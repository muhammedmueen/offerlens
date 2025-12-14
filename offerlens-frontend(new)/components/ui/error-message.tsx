/**
 * Error Message Component
 * 
 * Reusable component for displaying error messages
 * Requirement 6.2: Display user-friendly error messages
 */

import { AlertTriangle, XCircle, WifiOff, ServerCrash, RefreshCw } from "lucide-react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

export interface ErrorMessageProps {
  title?: string
  message: string
  type?: "error" | "network" | "server" | "warning"
  showIcon?: boolean
  showRetry?: boolean
  onRetry?: () => void
  className?: string
}

/**
 * Get icon based on error type
 */
function getErrorIcon(type: ErrorMessageProps["type"]) {
  switch (type) {
    case "network":
      return <WifiOff className="h-5 w-5" />
    case "server":
      return <ServerCrash className="h-5 w-5" />
    case "warning":
      return <AlertTriangle className="h-5 w-5" />
    case "error":
    default:
      return <XCircle className="h-5 w-5" />
  }
}

/**
 * Get default title based on error type
 */
function getDefaultTitle(type: ErrorMessageProps["type"]): string {
  switch (type) {
    case "network":
      return "Connection Error"
    case "server":
      return "Server Error"
    case "warning":
      return "Warning"
    case "error":
    default:
      return "Error"
  }
}

/**
 * Error Message Component
 * 
 * Displays error messages with appropriate styling and icons
 */
export function ErrorMessage({
  title,
  message,
  type = "error",
  showIcon = true,
  showRetry = false,
  onRetry,
  className,
}: ErrorMessageProps) {
  const displayTitle = title || getDefaultTitle(type)

  return (
    <Alert
      variant="destructive"
      className={cn("relative", className)}
    >
      {showIcon && (
        <div className="absolute left-4 top-4">
          {getErrorIcon(type)}
        </div>
      )}
      <div className={cn(showIcon && "pl-7")}>
        <AlertTitle>{displayTitle}</AlertTitle>
        <AlertDescription className="mt-2">
          {message}
        </AlertDescription>
        {showRetry && onRetry && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRetry}
            className="mt-3 gap-2"
          >
            <RefreshCw className="h-3 w-3" />
            Try Again
          </Button>
        )}
      </div>
    </Alert>
  )
}

/**
 * Inline Error Message (smaller, for forms)
 */
export function InlineErrorMessage({
  message,
  className,
}: {
  message: string
  className?: string
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 text-sm text-destructive",
        className
      )}
    >
      <XCircle className="h-4 w-4 shrink-0" />
      <span>{message}</span>
    </div>
  )
}

export default ErrorMessage
