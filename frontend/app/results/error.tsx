"use client"

/**
 * Results Page Error Handler
 * 
 * Handles errors specific to the results page
 * Requirement 6.2: Display user-friendly error messages for API failures
 */

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ResultsError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for debugging
    console.error("[Results Error]", error)

    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service
    }
  }, [error])

  // Determine error type
  const isDataMissing = error.message.includes("data") || error.message.includes("missing")
  const isAPIError = error.message.includes("API") || error.message.includes("server")

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
          <h1 className="text-2xl font-bold">
            {isDataMissing
              ? "No Results Available"
              : isAPIError
                ? "Analysis Failed"
                : "Something went wrong"}
          </h1>
          <p className="text-muted-foreground">
            {isDataMissing
              ? "We couldn't find any analysis results. Please upload an offer letter first."
              : isAPIError
                ? "We encountered an error while analyzing your offer. Please try uploading again."
                : "We encountered an error while displaying your results. Please try again."}
          </p>
        </div>

        {/* Error Details (Development Only) */}
        {process.env.NODE_ENV === "development" && (
          <div className="mt-4 p-4 rounded-lg bg-destructive/5 border border-destructive/20 text-left">
            <p className="text-sm font-mono text-destructive break-all">
              {error.message}
            </p>
            {error.digest && (
              <p className="text-xs text-muted-foreground mt-2">
                Error ID: {error.digest}
              </p>
            )}
          </div>
        )}

        {/* Helpful Tips */}
        <div className="p-4 rounded-lg bg-secondary/50 text-left">
          <p className="text-sm font-medium mb-2">What you can do:</p>
          <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
            <li>Try refreshing the page</li>
            <li>Upload your offer letter again</li>
            <li>Check your internet connection</li>
            <li>Contact support if the issue persists</li>
          </ul>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          {isDataMissing ? (
            <Link href="/upload" className="w-full sm:w-auto">
              <Button className="gap-2 w-full">
                <Upload className="h-4 w-4" />
                Upload Offer
              </Button>
            </Link>
          ) : (
            <Button onClick={reset} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
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
