"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { X, Cookie } from "lucide-react"
import { Button } from "@/components/ui/button"
import { getAnalyticsConsent, setAnalyticsConsent } from "@/lib/analytics"

/**
 * Analytics Consent Banner
 * 
 * Displays a banner to request user consent for analytics tracking
 * Requirement 17.4: Respect user privacy preferences
 */
export function AnalyticsConsentBanner() {
  const [showBanner, setShowBanner] = useState(false)

  useEffect(() => {
    // Check if user has already made a choice
    const consent = getAnalyticsConsent()
    
    // Show banner only if user hasn't made a choice yet
    if (consent === null) {
      // Delay showing banner slightly for better UX
      const timer = setTimeout(() => {
        setShowBanner(true)
      }, 2000)
      
      return () => clearTimeout(timer)
    }
  }, [])

  const handleAccept = () => {
    setAnalyticsConsent(true)
    setShowBanner(false)
  }

  const handleDecline = () => {
    setAnalyticsConsent(false)
    setShowBanner(false)
  }

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 30 }}
          className="fixed bottom-4 left-4 right-4 z-50 sm:left-auto sm:right-4 sm:max-w-md"
        >
          <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-4">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 mt-0.5">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-sm mb-1">
                  Analytics & Cookies
                </h3>
                <p className="text-xs text-muted-foreground mb-3">
                  We use analytics to improve your experience. Your data is never sold or shared with third parties.
                </p>
                
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={handleAccept}
                    className="text-xs h-8"
                  >
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleDecline}
                    className="text-xs h-8"
                  >
                    Decline
                  </Button>
                </div>
              </div>
              
              <button
                onClick={handleDecline}
                className="flex-shrink-0 rounded-md p-1 hover:bg-secondary transition-colors"
                aria-label="Close banner"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
