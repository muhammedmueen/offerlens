"use client"

/**
 * Maintenance Page Component
 * 
 * Displays when the backend is unavailable or in maintenance mode
 * Requirement 6.4: Display maintenance message when backend is unavailable
 */

import { motion } from "framer-motion"
import { Wrench, RefreshCw, Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

interface MaintenancePageProps {
  title?: string
  message?: string
  showRetry?: boolean
  onRetry?: () => void
}

export function MaintenancePage({
  title = "We'll be back soon",
  message = "We're currently performing scheduled maintenance. Please check back in a few minutes.",
  showRetry = true,
  onRetry,
}: MaintenancePageProps) {
  const handleRetry = () => {
    if (onRetry) {
      onRetry()
    } else {
      // Default: reload the page
      window.location.reload()
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-8 bg-gradient-to-b from-background to-secondary/20">
      <div className="max-w-md w-full text-center space-y-6">
        {/* Maintenance Icon with Animation */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-center"
        >
          <div className="relative">
            <div className="h-20 w-20 rounded-full bg-primary/10 flex items-center justify-center">
              <motion.div
                animate={{ rotate: [0, 15, -15, 0] }}
                transition={{
                  duration: 2,
                  repeat: Infinity,
                  ease: "easeInOut",
                }}
              >
                <Wrench className="h-10 w-10 text-primary" />
              </motion.div>
            </div>
            {/* Pulse effect */}
            <motion.div
              className="absolute inset-0 rounded-full bg-primary/20"
              animate={{
                scale: [1, 1.2, 1],
                opacity: [0.5, 0, 0.5],
              }}
              transition={{
                duration: 2,
                repeat: Infinity,
                ease: "easeInOut",
              }}
            />
          </div>
        </motion.div>

        {/* Message */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-2"
        >
          <h1 className="text-2xl font-bold">{title}</h1>
          <p className="text-muted-foreground">{message}</p>
        </motion.div>

        {/* Status Indicator */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="flex items-center justify-center gap-2 text-sm text-muted-foreground"
        >
          <motion.div
            className="h-2 w-2 rounded-full bg-yellow-500"
            animate={{
              opacity: [1, 0.5, 1],
            }}
            transition={{
              duration: 1.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
          <span>System under maintenance</span>
        </motion.div>

        {/* Action Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-3 justify-center pt-4"
        >
          {showRetry && (
            <Button onClick={handleRetry} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          )}
          <Link href="/">
            <Button variant="outline" className="gap-2 w-full sm:w-auto">
              <Home className="h-4 w-4" />
              Go Home
            </Button>
          </Link>
        </motion.div>

        {/* Additional Info */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="pt-4 text-xs text-muted-foreground"
        >
          <p>
            If the issue persists, please contact support at{" "}
            <a href="mailto:support@offerlens.com" className="text-primary hover:underline">
              support@offerlens.com
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  )
}

export default MaintenancePage
