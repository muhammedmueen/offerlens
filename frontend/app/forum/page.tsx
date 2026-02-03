import { Navbar } from "@/components/ui/navbar"
import { Footer } from "@/components/ui/footer"
import { ForumContent } from "@/components/forum/forum-content"

import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Feature Forum",
  description: "Vote and discuss feature requests for OfferLens. Share your ideas and help shape the future of job offer analysis.",
  alternates: {
    canonical: "/forum",
  },
  openGraph: {
    title: "Feature Forum - OfferLens",
    description: "Vote and discuss feature requests for OfferLens. Share your ideas and help shape the future of job offer analysis.",
    url: "/forum",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Feature Forum - OfferLens",
    description: "Vote and discuss feature requests for OfferLens. Share your ideas and help shape the future of job offer analysis.",
  },
}

export default function ForumPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      {/* Requirement 10.3: Main content landmark with ID for skip link */}
      <main id="main-content" className="flex-1 pt-16">
        <ForumContent />
      </main>
      <Footer />
    </div>
  )
}
