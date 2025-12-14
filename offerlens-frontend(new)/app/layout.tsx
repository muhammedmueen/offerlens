import type React from "react"
import type { Metadata, Viewport } from "next"
import { Inter, Geist_Mono } from "next/font/google"
import { Analytics } from "@vercel/analytics/next"
import { ThemeProvider } from "@/components/theme-provider"
import { QueryProvider } from "@/providers/QueryProvider"
import { OfferProvider } from "@/context/OfferContext"
import { Toaster } from "@/components/ui/toaster"
import { AnalyticsConsentBanner } from "@/components/ui/analytics-consent-banner"
import "./globals.css"

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
})

const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL || "https://offerlens.com"),
  title: {
    default: "OfferLens - AI-Powered Job Offer Analysis",
    template: "%s | OfferLens",
  },
  description:
    "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies.",
  keywords: [
    "job offer",
    "salary analysis",
    "negotiation",
    "career",
    "AI",
    "offer letter",
    "compensation",
    "red flags",
    "job search",
  ],
  authors: [{ name: "OfferLens Team" }],
  creator: "OfferLens",
  publisher: "OfferLens",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "/",
    title: "OfferLens - AI-Powered Job Offer Analysis",
    description:
      "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies.",
    siteName: "OfferLens",
    images: [
      {
        url: "/placeholder-logo.png",
        width: 1200,
        height: 630,
        alt: "OfferLens - AI-Powered Job Offer Analysis",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "OfferLens - AI-Powered Job Offer Analysis",
    description:
      "Analyze your job offers with AI. Get insights on red flags, salary comparisons, and negotiation strategies.",
    images: ["/placeholder-logo.png"],
    creator: "@offerlens",
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  verification: {
    // Add verification tokens when available
    // google: 'google-site-verification-token',
    // yandex: 'yandex-verification-token',
  },
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0f0f0f" },
  ],
  width: "device-width",
  initialScale: 1,
  maximumScale: 5, // Allow zoom for accessibility
  userScalable: true, // Enable pinch-to-zoom
  viewportFit: "cover", // For notched devices
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // Only enable analytics in production
  const isProduction = process.env.NODE_ENV === "production"

  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${inter.variable} ${geistMono.variable} font-sans antialiased`}>
        <QueryProvider>
          <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
            <OfferProvider>
              {children}
              <Toaster />
              <AnalyticsConsentBanner />
            </OfferProvider>
          </ThemeProvider>
        </QueryProvider>
        {isProduction && <Analytics />}
      </body>
    </html>
  )
}
