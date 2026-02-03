/**
 * Structured Data (JSON-LD) component for SEO
 * Requirements: 11.1, 11.2 - Enhance SEO with structured data
 */

interface StructuredDataProps {
  type: "WebSite" | "WebApplication" | "Organization"
  data?: Record<string, unknown>
}

export function StructuredData({ type, data }: StructuredDataProps) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://offerlens.com"

  const getStructuredData = () => {
    switch (type) {
      case "WebSite":
        return {
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "OfferLens",
          url: baseUrl,
          description:
            "AI-powered job offer analysis platform. Get insights on red flags, salary comparisons, and negotiation strategies.",
          potentialAction: {
            "@type": "SearchAction",
            target: {
              "@type": "EntryPoint",
              urlTemplate: `${baseUrl}/upload`,
            },
            "query-input": "required name=search_term_string",
          },
          ...data,
        }

      case "WebApplication":
        return {
          "@context": "https://schema.org",
          "@type": "WebApplication",
          name: "OfferLens",
          url: baseUrl,
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
          },
          description:
            "AI-powered job offer analysis platform. Get insights on red flags, salary comparisons, and negotiation strategies.",
          ...data,
        }

      case "Organization":
        return {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "OfferLens",
          url: baseUrl,
          logo: `${baseUrl}/placeholder-logo.png`,
          description:
            "AI-powered job offer analysis platform helping professionals make informed career decisions.",
          sameAs: [
            // Add social media links when available
            // "https://twitter.com/offerlens",
            // "https://linkedin.com/company/offerlens",
          ],
          ...data,
        }

      default:
        return null
    }
  }

  const structuredData = getStructuredData()

  if (!structuredData) return null

  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
    />
  )
}
