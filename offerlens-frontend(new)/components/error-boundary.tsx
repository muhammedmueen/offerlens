"use client"

/**
 * Error Boundary Component
 * 
 * Catches React component errors and displays a fallback UI
 * Requirement 6.1: Component errors are caught by error boundaries
 */

import React, { Component, ReactNode } from "react"
import { AlertTriangle, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ErrorBoundaryProps {
  children: ReactNode
  fallback?: React.ComponentType<{ error: Error; reset: () => void }>
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Default fallback UI for error boundary
 */
function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-muted-foreground">
            We encountered an unexpected error. Please try refreshing the page or return to the home page.
          </p>
        </div>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === "development" && error && (
          <div className="mt-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-left">
            <p className="text-sm font-mono text-destructive break-all">
              {error.message}
            </p>
            {error.stack && (
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Stack trace
                </summary>
                <pre className="mt-2 text-xs text-muted-foreground overflow-auto max-h-40">
                  {error.stack}
                </pre>
              </details>
            )}
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button onClick={reset} className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
          <Link href="/">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
        </div>
      </div>
    </div>
  )
}

/**
 * Error Boundary Class Component
 * 
 * React Error Boundaries must be class components
 * Catches errors in child components and displays fallback UI
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = {
      hasError: false,
      error: null,
    }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
    }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    // Requirement 6.5: Log error details for debugging
    console.error("[Error Boundary] Caught error:", error)
    console.error("[Error Boundary] Error info:", errorInfo)

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo)
    }

    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service (e.g., Sentry)
      // Example: Sentry.captureException(error, { contexts: { react: errorInfo } })
    }
  }

  reset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    })
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      // Use custom fallback if provided, otherwise use default
      const FallbackComponent = this.props.fallback || DefaultErrorFallback

      return <FallbackComponent error={this.state.error} reset={this.reset} />
    }

    return this.props.children
  }
}

export default ErrorBoundary
