"use client"

/**
 * Upload Page Error Handler
 * 
 * Handles errors specific to the upload page
 * Requirement 6.3: Display specific error messages for upload failures
 */

import { useEffect } from "react"
import { AlertTriangle, RefreshCw, Home, Upload } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface ErrorProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function UploadError({ error, reset }: ErrorProps) {
  useEffect(() => {
    // Log error for debugging
    console.error("[Upload Error]", error)

    // In production, send to error tracking service
    if (process.env.NODE_ENV === "production") {
      // TODO: Send to error tracking service
    }
  }, [error])

  // Determine if this is a file upload specific error
  const isFileError = error.message.includes("file") || error.message.includes("upload")

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Error Icon */}
        <div className="flex justify-center">
          <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center">
            {isFileError ? (
              <Upload className="h-8 w-8 text-destructive" />
            ) : (
              <AlertTriangle className="h-8 w-8 text-destructive" />
            )}
          </div>
        </div>

        {/* Error Message */}
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">
            {isFileError ? "Upload Failed" : "Something went wrong"}
          </h1>
          <p className="text-muted-foreground">
            {isFileError
              ? "We couldn't process your file. Please check the file format and size, then try again."
              : "We encountered an error while preparing the upload page. Please try again."}
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

        {/* Common Upload Issues */}
        {isFileError && (
          <div className="p-4 rounded-lg bg-secondary/50 text-left">
            <p className="text-sm font-medium mb-2">Common issues:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>File size exceeds 10MB limit</li>
              <li>Unsupported file format (use PDF or images)</li>
              <li>Network connection interrupted</li>
              <li>File is corrupted or unreadable</li>
            </ul>
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
