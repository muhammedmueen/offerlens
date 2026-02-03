/**
 * Feature Request Page Loading State
 * 
 * Displays skeleton loaders while the feature request page is loading
 * Requirement 7.1: Display loading indicator during navigation
 */

import { Skeleton } from "@/components/ui/skeleton"

export default function FeatureRequestLoading() {
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

            {/* Title Skeleton */}
            <div className="text-center mb-8 space-y-2">
              <Skeleton className="h-10 w-80 mx-auto" />
              <Skeleton className="h-5 w-96 mx-auto" />
            </div>

            {/* Form Card Skeleton */}
            <div className="rounded-lg border bg-card p-6">
              <div className="space-y-6">
                {/* Type Field */}
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>

                {/* Title Field */}
                <div className="space-y-2">
                  <Skeleton className="h-5 w-24" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>

                {/* Description Field */}
                <div className="space-y-2">
                  <Skeleton className="h-5 w-32" />
                  <Skeleton className="h-32 w-full rounded-lg" />
                </div>

                {/* Email Field */}
                <div className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton className="h-12 w-full rounded-lg" />
                </div>

                {/* Submit Button */}
                <Skeleton className="h-12 w-full rounded-lg" />
              </div>
            </div>

            {/* Recent Requests Skeleton */}
            <div className="mt-12">
              <Skeleton className="h-8 w-48 mb-6" />
              <div className="space-y-4">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="rounded-lg border bg-card p-4">
                    <div className="flex items-start gap-3">
                      <Skeleton className="h-6 w-20 rounded-full" />
                      <div className="flex-1 space-y-2">
                        <Skeleton className="h-5 w-3/4" />
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-32" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
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
