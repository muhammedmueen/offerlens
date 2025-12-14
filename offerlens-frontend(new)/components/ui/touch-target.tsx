"use client"

import { forwardRef } from "react"
import { cn } from "@/lib/utils"

/**
 * Touch Target Component
 * 
 * Ensures interactive elements meet minimum touch target size (44x44px)
 * Requirement: 8.5 - Touch gesture support
 */

interface TouchTargetProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  className?: string
  asChild?: boolean
}

export const TouchTarget = forwardRef<HTMLDivElement, TouchTargetProps>(
  ({ children, className, asChild = false, ...props }, ref) => {
    if (asChild) {
      return <>{children}</>
    }

    return (
      <div
        ref={ref}
        className={cn(
          "touch-target touch-friendly inline-flex items-center justify-center",
          className,
        )}
        {...props}
      >
        {children}
      </div>
    )
  },
)

TouchTarget.displayName = "TouchTarget"
