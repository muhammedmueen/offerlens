"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"
import { useAnimations } from "@/hooks/use-animations"
import type { ReactNode } from "react"

interface InteractiveCardProps {
  children: ReactNode
  className?: string
  variant?: "default" | "hover-lift" | "hover-scale" | "hover-glow"
  onClick?: () => void
}

/**
 * Interactive card component with hover and click animations
 * Requirement 9.2: Hover effects on interactive elements
 * Requirement 9.4: Button click feedback
 */
export function InteractiveCard({ 
  children, 
  className, 
  variant = "default",
  onClick 
}: InteractiveCardProps) {
  const { shouldReduceMotion } = useAnimations()

  if (shouldReduceMotion) {
    return (
      <div
        onClick={onClick}
        className={cn(
          "rounded-lg border bg-card p-6 shadow-sm transition-colors",
          onClick && "cursor-pointer",
          className
        )}
      >
        {children}
      </div>
    )
  }

  const getAnimationProps = () => {
    switch (variant) {
      case "hover-lift":
        return {
          whileHover: { y: -4, boxShadow: "var(--shadow-lg)" },
          whileTap: { y: 0, scale: 0.98 },
        }
      case "hover-scale":
        return {
          whileHover: { scale: 1.02 },
          whileTap: { scale: 0.98 },
        }
      case "hover-glow":
        return {
          whileHover: { boxShadow: "var(--shadow-primary-md)" },
          whileTap: { scale: 0.98 },
        }
      default:
        return {
          whileTap: { scale: 0.98 },
        }
    }
  }

  return (
    <motion.div
      {...getAnimationProps()}
      transition={{ type: "spring", stiffness: 400, damping: 17 }}
      onClick={onClick}
      className={cn(
        "rounded-lg border bg-card p-6 shadow-sm transition-colors",
        onClick && "cursor-pointer",
        className
      )}
    >
      {children}
    </motion.div>
  )
}
