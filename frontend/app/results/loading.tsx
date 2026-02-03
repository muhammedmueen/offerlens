"use client"

/**
 * Results Page Loading State
 * 
 * Displays skeleton loaders while analysis results are loading
 * Requirement 7.3: Display loading animation during analysis
 * Requirement 7.4: Display skeleton loaders for content areas
 */

import { Skeleton } from "@/components/ui/skeleton"
import { Sparkles } from "lucide-react"

export default function ResultsLoading() {
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
          <div className="mx-auto max-w-6xl px-4 sm:px-6">
            {/* Back Link Skeleton */}
            <div className="mb-6">
              <Skeleton className="h-5 w-32" />
            </div>

            {/* Analysis Loading Animation */}
            <div className="mb-8 flex flex-col items-center justify-center py-12">
              <div className="relative">
                <div className="h-16 w-16 rounded-full bg-primary/10 flex items-center justify-center">
                  <Sparkles className="h-8 w-8 text-primary animate-pulse" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
              </div>
              <p className="mt-4 text-lg font-medium">Analyzing your offer...</p>
              <p className="text-sm text-muted-foreground">This may take a few moments</p>
            </div>

            {/* Results Grid Skeleton */}
            <div className="grid gap-6 lg:grid-cols-2">
              {/* Offer Summary Card Skeleton */}
              <div className="rounded-lg border bg-card p-6">
                <Skeleton className="h-6 w-40 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                </div>
              </div>

              {/* Take Home Card Skeleton */}
              <div className="rounded-lg border bg-card p-6">
                <Skeleton className="h-6 w-40 mb-4" />
                <Skeleton className="h-24 w-full rounded-lg" />
              </div>

              {/* Salary Comparison Card Skeleton */}
              <div className="rounded-lg border bg-card p-6 lg:col-span-2">
                <Skeleton className="h-6 w-48 mb-4" />
                <div className="space-y-4">
                  <Skeleton className="h-32 w-full rounded-lg" />
                  <div className="grid grid-cols-3 gap-4">
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                    <Skeleton className="h-16 w-full rounded-lg" />
                  </div>
                </div>
              </div>

              {/* Red Flags Card Skeleton */}
              <div className="rounded-lg border bg-card p-6 lg:col-span-2">
                <Skeleton className="h-6 w-32 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                  <Skeleton className="h-20 w-full rounded-lg" />
                </div>
              </div>

              {/* Negotiation Blueprint Card Skeleton */}
              <div className="rounded-lg border bg-card p-6 lg:col-span-2">
                <Skeleton className="h-6 w-48 mb-4" />
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                  <Skeleton className="h-16 w-full rounded-lg" />
                </div>
              </div>
            </div>

            {/* Action Buttons Skeleton */}
            <div className="mt-8 flex gap-4 justify-center">
              <Skeleton className="h-12 w-40 rounded-lg" />
              <Skeleton className="h-12 w-40 rounded-lg" />
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
