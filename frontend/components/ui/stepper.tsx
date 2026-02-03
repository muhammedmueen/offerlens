"use client"

import { motion } from "framer-motion"
import { Check } from "lucide-react"
import { cn } from "@/lib/utils"

interface Step {
  label: string
  description?: string
}

interface StepperProps {
  steps: Step[]
  currentStep: number
  className?: string
}

export function Stepper({ steps, currentStep, className }: StepperProps) {
  return (
    <div className={cn("flex items-center justify-center gap-2", className)}>
      {steps.map((step, index) => {
        const isComplete = index < currentStep
        const isCurrent = index === currentStep
        const isLast = index === steps.length - 1

        return (
          <div key={step.label} className="flex items-center">
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: index * 0.1 }}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm font-semibold transition-all",
                  isComplete && "border-primary bg-primary text-primary-foreground",
                  isCurrent && "border-primary text-primary",
                  !isComplete && !isCurrent && "border-muted text-muted-foreground",
                )}
              >
                {isComplete ? (
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                  >
                    <Check className="h-5 w-5" />
                  </motion.div>
                ) : (
                  index + 1
                )}
                {isCurrent && (
                  <motion.div
                    className="absolute inset-0 rounded-full border-2 border-primary"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Number.POSITIVE_INFINITY }}
                    style={{ opacity: 0.3 }}
                  />
                )}
              </motion.div>
              <span
                className={cn(
                  "mt-2 text-xs font-medium text-center max-w-[80px]",
                  isComplete || isCurrent ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </div>

            {!isLast && (
              <div className="mx-2 mb-6 h-0.5 w-12 sm:w-20 overflow-hidden rounded-full bg-muted">
                <motion.div
                  className="h-full bg-primary"
                  initial={{ width: 0 }}
                  animate={{ width: isComplete ? "100%" : "0%" }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
