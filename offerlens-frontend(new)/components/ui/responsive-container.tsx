import { cn } from "@/lib/utils"

/**
 * Responsive Container Component
 * 
 * Provides consistent responsive padding and max-width across breakpoints
 * Requirements: 8.1, 8.2, 8.3, 8.4
 */

interface ResponsiveContainerProps {
  children: React.ReactNode
  className?: string
  size?: "sm" | "md" | "lg" | "xl" | "full"
  noPadding?: boolean
}

const sizeClasses = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-5xl",
  xl: "max-w-7xl",
  full: "max-w-full",
}

export function ResponsiveContainer({
  children,
  className,
  size = "lg",
  noPadding = false,
}: ResponsiveContainerProps) {
  return (
    <div
      className={cn(
        "mx-auto w-full",
        sizeClasses[size],
        !noPadding && "px-4 sm:px-6 lg:px-8",
        className,
      )}
    >
      {children}
    </div>
  )
}
