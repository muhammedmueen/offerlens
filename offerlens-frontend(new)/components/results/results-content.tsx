"use client"

import { useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion } from "framer-motion"
import { CheckCircle, Download, Share2, ArrowLeft, RefreshCw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Stepper } from "@/components/ui/stepper"
import { OfferSummaryCard } from "@/components/results/offer-summary-card"
import { RedFlagsCard } from "@/components/results/red-flags-card"
import { SalaryComparisonCard } from "@/components/results/salary-comparison-card"
import { TakeHomeCard } from "@/components/results/take-home-card"
import { NegotiationBlueprintCard } from "@/components/results/negotiation-blueprint-card"
import { useOffer } from "@/context/OfferContext"
import { trackConversion } from "@/lib/analytics"

const steps = [{ label: "Upload" }, { label: "Details" }, { label: "Analyze" }]

/**
 * Results Content Component
 * 
 * Main results page displaying offer analysis
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5
 */
export function ResultsContent() {
  const router = useRouter()
  const { currentOffer, offerDetails, clearOffer } = useOffer()

  // Redirect to upload if no offer data
  useEffect(() => {
    if (!currentOffer || !offerDetails) {
      router.push("/upload")
    }
  }, [currentOffer, offerDetails, router])

  // Track conversion when results are displayed
  // Requirement 17.2: Track conversion event
  useEffect(() => {
    if (currentOffer && currentOffer.redFlags && currentOffer.negotiationSuggestions) {
      trackConversion({
        redFlagsCount: currentOffer.redFlags.length,
        salaryComparison: currentOffer.salaryComparison?.comparison || 'unknown',
        hasNegotiationTips: currentOffer.negotiationSuggestions.length > 0,
      })
    }
  }, [currentOffer])

  // Don't render if no data
  if (!currentOffer || !offerDetails) {
    return null
  }

  const handleAnalyzeAnother = () => {
    clearOffer()
    router.push("/upload")
  }

  return (
    <div className="py-6 sm:py-8 md:py-12">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <Link
            href="/upload"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Upload
          </Link>
        </motion.div>

        {/* Stepper - Completed */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Stepper steps={steps} currentStep={3} className="mb-8" />
        </motion.div>

        {/* Success Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", stiffness: 300, damping: 20, delay: 0.3 }}
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-success-soft"
          >
            <CheckCircle className="h-8 w-8 text-success" />
          </motion.div>
          <h1 className="text-2xl font-bold sm:text-3xl">Analysis Complete</h1>
          <p className="mt-2 text-muted-foreground">
            {offerDetails.role} • {offerDetails.experience} • {offerDetails.city} • ₹{offerDetails.ctc} LPA
          </p>

          {/* Action Buttons - Requirement 8.1, 8.5: Responsive with touch targets */}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 bg-transparent touch-target min-h-[44px]"
            >
              <Download className="h-4 w-4" />
              <span className="hidden sm:inline">Export</span>
              <span className="sm:hidden">Export</span>
            </Button>
            <Button 
              variant="outline" 
              size="sm" 
              className="gap-2 bg-transparent touch-target min-h-[44px]"
            >
              <Share2 className="h-4 w-4" />
              <span className="hidden sm:inline">Share</span>
              <span className="sm:hidden">Share</span>
            </Button>
          </div>
        </motion.div>

        {/* Results Cards */}
        <div className="space-y-6">
          <OfferSummaryCard 
            offerText={offerDetails.offerText}
            role={offerDetails.role}
            experience={offerDetails.experience}
            city={offerDetails.city}
            ctc={offerDetails.ctc}
          />
          <RedFlagsCard redFlags={currentOffer.redFlags || []} />
          <SalaryComparisonCard 
            salaryComparison={currentOffer.salaryComparison}
            offeredSalary={offerDetails.ctc * 100000} // Convert LPA to annual
          />
          <TakeHomeCard takeHome={currentOffer.takeHome} />
          <NegotiationBlueprintCard suggestions={currentOffer.negotiationSuggestions || []} />
        </div>

        {/* Analyze Another Button */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="mt-8"
        >
          <Button 
            variant="outline" 
            className="w-full gap-2 bg-transparent"
            onClick={handleAnalyzeAnother}
          >
            <RefreshCw className="h-4 w-4" />
            Analyze Another Offer
          </Button>
        </motion.div>
      </div>
    </div>
  )
}
