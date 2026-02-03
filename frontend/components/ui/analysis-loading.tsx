"use client"

/**
 * Analysis Loading Animation
 * 
 * Displays an animated loading state during offer analysis
 * Requirement 7.3: Display loading animation during analysis
 */

import { motion } from "framer-motion"
import { Sparkles, FileText, TrendingUp, AlertTriangle, Lightbulb } from "lucide-react"
import { cn } from "@/lib/utils"

interface AnalysisLoadingProps {
  className?: string
}

const steps = [
  { icon: FileText, label: "Reading offer letter", delay: 0 },
  { icon: AlertTriangle, label: "Detecting red flags", delay: 0.5 },
  { icon: TrendingUp, label: "Comparing salary", delay: 1 },
  { icon: Lightbulb, label: "Generating insights", delay: 1.5 },
]

export function AnalysisLoading({ className }: AnalysisLoadingProps) {
  return (
    <div className={cn("flex flex-col items-center justify-center py-12", className)}>
      {/* Main Loading Icon */}
      <motion.div
        className="relative mb-8"
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.5 }}
      >
        <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          >
            <Sparkles className="h-10 w-10 text-primary" />
          </motion.div>
        </div>
        
        {/* Pulsing Ring */}
        <motion.div
          className="absolute inset-0 rounded-full border-2 border-primary/30"
          animate={{ scale: [1, 1.2, 1], opacity: [0.5, 0, 0.5] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>

      {/* Main Text */}
      <motion.h2
        className="text-xl font-semibold mb-2"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        Analyzing your offer...
      </motion.h2>
      
      <motion.p
        className="text-sm text-muted-foreground mb-8"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        This may take a few moments
      </motion.p>

      {/* Analysis Steps */}
      <div className="w-full max-w-md space-y-3">
        {steps.map((step, index) => (
          <motion.div
            key={step.label}
            className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: step.delay }}
          >
            <motion.div
              className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0"
              animate={{ scale: [1, 1.1, 1] }}
              transition={{
                delay: step.delay + 0.5,
                duration: 1.5,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            >
              <step.icon className="h-4 w-4 text-primary" />
            </motion.div>
            
            <span className="text-sm text-muted-foreground">{step.label}</span>
            
            {/* Animated Dots */}
            <motion.div
              className="ml-auto flex gap-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: step.delay + 0.3 }}
            >
              {[0, 1, 2].map((dot) => (
                <motion.div
                  key={dot}
                  className="h-1.5 w-1.5 rounded-full bg-primary"
                  animate={{ opacity: [0.3, 1, 0.3] }}
                  transition={{
                    delay: step.delay + dot * 0.2,
                    duration: 1.5,
                    repeat: Infinity,
                    ease: "easeInOut",
                  }}
                />
              ))}
            </motion.div>
          </motion.div>
        ))}
      </div>

      {/* Progress Bar */}
      <motion.div
        className="w-full max-w-md mt-8"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.5 }}
      >
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-primary"
            initial={{ width: "0%" }}
            animate={{ width: "100%" }}
            transition={{ duration: 3, ease: "easeInOut", repeat: Infinity }}
          />
        </div>
      </motion.div>
    </div>
  )
}
