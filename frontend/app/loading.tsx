/**
 * Root Loading State
 * 
 * Displays a loading indicator for the root layout
 * Requirement 7.1: Display loading indicator during navigation
 */

import { Spinner } from "@/components/ui/spinner"

export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner className="h-8 w-8" />
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}
