import type { Metadata } from "next"
import { Navbar } from "@/components/ui/navbar"
import { Footer } from "@/components/ui/footer"
import { HeroSection } from "@/components/home/hero-section"
import { FeaturesSection } from "@/components/home/features-section"
import { HowItWorksSection } from "@/components/home/how-it-works-section"
import { FAQSection } from "@/components/home/faq-section"
import { CTASection } from "@/components/ui/cta-section"
import { StructuredData } from "@/components/seo/structured-data"

export const metadata: Metadata = {
  title: "OfferLens - AI-Powered Job Offer Analysis",
  description:
    "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies. Make informed career decisions with confidence.",
  openGraph: {
    title: "OfferLens - AI-Powered Job Offer Analysis",
    description:
      "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies. Make informed career decisions with confidence.",
    url: "/",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "OfferLens - AI-Powered Job Offer Analysis",
    description:
      "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies. Make informed career decisions with confidence.",
  },
}

export default function HomePage() {
  return (
    <>
      <StructuredData type="WebSite" />
      <StructuredData type="WebApplication" />
      <StructuredData type="Organization" />
      <div className="min-h-screen flex flex-col">
        <Navbar />
        {/* Requirement 10.3: Main content landmark with ID for skip link */}
        <main id="main-content" className="flex-1 pt-16">
          <HeroSection />
          <FeaturesSection />
          <HowItWorksSection />
          <FAQSection />
          <CTASection
            headline="Ready to decode your offer?"
            subtext="Get AI-powered insights that help you negotiate with confidence and make informed career decisions."
            buttonText="Analyze Your Offer"
            buttonHref="/upload"
          />
        </main>
        <Footer />
      </div>
    </>
  )
}
