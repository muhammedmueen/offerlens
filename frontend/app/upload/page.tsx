import { Navbar } from "@/components/ui/navbar"
import { Footer } from "@/components/ui/footer"
import { UploadForm } from "@/components/upload/upload-form"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Upload Offer",
  description: "Upload your job offer letter for AI-powered analysis. Get instant insights on red flags, salary comparison, and negotiation tips.",
  alternates: {
    canonical: "/upload",
  },
  openGraph: {
    title: "Upload Your Offer - OfferLens",
    description: "Upload your job offer letter for AI-powered analysis. Get instant insights on red flags, salary comparison, and negotiation tips.",
    url: "/upload",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Upload Your Offer - OfferLens",
    description: "Upload your job offer letter for AI-powered analysis. Get instant insights on red flags, salary comparison, and negotiation tips.",
  },
}

export default function UploadPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* Requirement 10.3: Main content landmark with ID for skip link */}
      <main id="main-content" className="flex-1 pt-16">
        <UploadForm />
      </main>
      <Footer />
    </div>
  )
}
