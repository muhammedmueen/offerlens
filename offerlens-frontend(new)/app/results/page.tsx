import { Navbar } from "@/components/ui/navbar"
import { Footer } from "@/components/ui/footer"
import { ResultsContent } from "@/components/results/results-content"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Analysis Results",
  description: "Your AI-powered job offer analysis results with red flags, salary comparison, and negotiation strategies.",
  alternates: {
    canonical: "/results",
  },
  openGraph: {
    title: "Analysis Results - OfferLens",
    description: "Your AI-powered job offer analysis results with red flags, salary comparison, and negotiation strategies.",
    url: "/results",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Analysis Results - OfferLens",
    description: "Your AI-powered job offer analysis results with red flags, salary comparison, and negotiation strategies.",
  },
  robots: {
    index: false, // Don't index results pages as they contain user-specific data
    follow: true,
  },
}

export default function ResultsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* Requirement 10.3: Main content landmark with ID for skip link */}
      <main id="main-content" className="flex-1 pt-16">
        <ResultsContent />
      </main>
      <Footer />
    </div>
  )
}
