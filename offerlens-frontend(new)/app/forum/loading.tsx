/**
 * Forum Page Loading State
 * 
 * Displays skeleton loaders while forum data is loading
 * Requirement 7.4: Display skeleton loaders for content areas
 */

import { Skeleton } from "@/components/ui/skeleton"

export default function ForumLoading() {
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
          <div className="mx-auto max-w-4xl px-4 sm:px-6">
            {/* Back Link Skeleton */}
            <div className="mb-6">
              <Skeleton className="h-5 w-32" />
            </div>

            {/* Title Skeleton */}
            <div className="mb-8 space-y-2">
              <Skeleton className="h-10 w-64" />
              <Skeleton className="h-5 w-96" />
            </div>

            {/* Forum Posts Skeleton */}
            <div className="space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="rounded-lg border bg-card p-6">
                  <div className="flex items-start gap-4">
                    {/* Avatar */}
                    <Skeleton className="h-10 w-10 rounded-full shrink-0" />
                    
                    {/* Content */}
                    <div className="flex-1 space-y-3">
                      <div className="flex items-center gap-2">
                        <Skeleton className="h-5 w-32" />
                        <Skeleton className="h-4 w-24" />
                      </div>
                      <Skeleton className="h-6 w-3/4" />
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-4 w-5/6" />
                      
                      {/* Meta */}
                      <div className="flex items-center gap-4 pt-2">
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                        <Skeleton className="h-4 w-20" />
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination Skeleton */}
            <div className="mt-8 flex justify-center gap-2">
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
              <Skeleton className="h-10 w-10 rounded-lg" />
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
