/**
 * Upload Page Loading State
 * 
 * Displays a loading indicator while the upload page is loading
 * Requirement 7.1: Display loading indicator during navigation
 */

import { Skeleton } from "@/components/ui/skeleton"

export default function UploadLoading() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar Skeleton */}
      <div className="fixed top-0 left-0 right-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-16 items-center justify-between">
          <Skeleton className="h-8 w-32" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-10 rounded-full" />
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="flex-1 pt-16">
        <div className="py-8 sm:py-12">
          <div className="mx-auto max-w-2xl px-4 sm:px-6">
            {/* Back Link Skeleton */}
            <div className="mb-6">
              <Skeleton className="h-5 w-32" />
            </div>

            {/* Stepper Skeleton */}
            <div className="mb-8 flex items-center justify-between">
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-1 flex-1 mx-4" />
              <Skeleton className="h-10 w-24" />
              <Skeleton className="h-1 flex-1 mx-4" />
              <Skeleton className="h-10 w-24" />
            </div>

            {/* Title Skeleton */}
            <div className="text-center mb-8 space-y-2">
              <Skeleton className="h-8 w-64 mx-auto" />
              <Skeleton className="h-5 w-96 mx-auto" />
            </div>

            {/* Demo Banner Skeleton */}
            <div className="mb-6">
              <Skeleton className="h-16 w-full rounded-lg" />
            </div>

            {/* Upload Card Skeleton */}
            <div className="space-y-6">
              <div className="rounded-lg border bg-card p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-48 w-full rounded-lg" />
              </div>

              {/* Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-4 text-sm text-muted-foreground">or</span>
                </div>
              </div>

              {/* Paste Text Card Skeleton */}
              <div className="rounded-lg border bg-card p-6">
                <Skeleton className="h-6 w-32 mb-4" />
                <Skeleton className="h-32 w-full rounded-lg" />
              </div>
            </div>

            {/* Button Skeleton */}
            <div className="mt-8">
              <Skeleton className="h-12 w-full rounded-lg" />
            </div>
          </div>
        </div>
      </main>

      {/* Footer Skeleton */}
      <div className="border-t">
        <div className="container py-8">
          <Skeleton className="h-20 w-full" />
        </div>
      </div>
    </div>
  )
}
