import { Navbar } from "@/components/ui/navbar"
import { Footer } from "@/components/ui/footer"
import { FeatureRequestForm } from "@/components/feature-request/feature-request-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Submit Feature Request",
  description: "Submit a feature request or bug report for OfferLens. Help us improve the platform for everyone.",
  alternates: {
    canonical: "/feature-request",
  },
  openGraph: {
    title: "Submit Feature Request - OfferLens",
    description: "Submit a feature request or bug report for OfferLens. Help us improve the platform for everyone.",
    url: "/feature-request",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Submit Feature Request - OfferLens",
    description: "Submit a feature request or bug report for OfferLens. Help us improve the platform for everyone.",
  },
}

export default function FeatureRequestPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* Requirement 10.3: Main content landmark with ID for skip link */}
      <main id="main-content" className="flex-1 pt-16">
        <FeatureRequestForm />
      </main>
      <Footer />
    </div>
  )
}
