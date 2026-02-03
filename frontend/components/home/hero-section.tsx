"use client"

import Link from "next/link"
import dynamic from "next/dynamic"
import { motion, useReducedMotion } from "framer-motion"
import { ArrowRight, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { MagneticButton } from "@/components/animations/magnetic-button"

const HeroScene = dynamic(() => import("@/components/animations/3d-hero-scene").then((mod) => mod.HeroScene), {
  ssr: false,
  loading: () => null,
})

function CSSFallbackBackground() {
  return (
    <div className="absolute inset-0 -z-10 overflow-hidden">
      <div className="css-blob css-blob-1" />
      <div className="css-blob css-blob-2" />
      <div className="css-blob css-blob-3" />
    </div>
  )
}

export function HeroSection() {
  const shouldReduceMotion = useReducedMotion()

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.1,
        delayChildren: 0.1,
      },
    },
  }

  const itemVariants = {
    hidden: {
      opacity: 0,
      y: shouldReduceMotion ? 0 : 20,
    },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.1 : 0.5,
        ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
      },
    },
  }

  return (
    <section 
      className="relative min-h-[calc(100vh-4rem)] flex items-center justify-center overflow-hidden"
      aria-label="Hero section"
    >
      {shouldReduceMotion ? <CSSFallbackBackground /> : <HeroScene />}

      {/* Gradient mesh background - always present */}
      <div className="absolute inset-0 -z-20 gradient-mesh opacity-60 dark:opacity-40" aria-hidden="true" />

      {/* Content - Requirement 8.1, 8.2, 8.3: Responsive layout */}
      <motion.div
        variants={containerVariants}
        initial="hidden"
        animate="visible"
        className="relative mx-auto max-w-3xl px-4 py-12 sm:py-16 md:py-20 text-center sm:px-6"
        style={{ paddingInline: "var(--container-padding)" }}
      >
        {/* Badge */}
        <motion.div
          variants={itemVariants}
          className="mb-6 inline-flex items-center gap-2 rounded-full border glass px-4 py-1.5 text-fluid-sm"
          role="status"
          aria-label="Feature badge"
        >
          <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          <span>AI-Powered Offer Analysis</span>
        </motion.div>

        {/* Heading */}
        <motion.h1
          variants={itemVariants}
          className="text-fluid-5xl font-bold tracking-tight sm:text-fluid-6xl text-balance"
          style={{ lineHeight: "var(--leading-tight)" }}
        >
          Decode your job offer
          <span className="block gradient-text">in seconds</span>
        </motion.h1>

        {/* Tagline */}
        <motion.p
          variants={itemVariants}
          className="mt-6 text-fluid-lg text-muted-foreground sm:text-fluid-xl text-balance"
          style={{ lineHeight: "var(--leading-relaxed)" }}
        >
          Upload your offer letter and let AI reveal red flags, compare your salary to market rates, and generate
          negotiation strategies.
        </motion.p>

        {/* CTA Buttons - Requirement 8.1, 8.5: Mobile-optimized with touch targets */}
        <motion.div
          variants={itemVariants}
          className="mt-8 sm:mt-10 flex flex-col items-center gap-3 sm:gap-4 sm:flex-row sm:justify-center w-full sm:w-auto px-4 sm:px-0"
        >
          <MagneticButton>
            <Link href="/upload" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="gap-2 w-full sm:min-w-[200px] shadow-primary transition-smooth hover:shadow-primary-lg touch-target min-h-[48px] sm:min-h-[44px]"
              >
                Analyze Your Offer
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
          </MagneticButton>
          <Link href="#features" className="w-full sm:w-auto">
            <Button 
              variant="outline" 
              size="lg" 
              className="w-full sm:min-w-[200px] glass interactive-lift bg-transparent touch-target min-h-[48px] sm:min-h-[44px]"
            >
              Learn More
            </Button>
          </Link>
        </motion.div>

        {/* Trust indicator */}
        <motion.p variants={itemVariants} className="mt-10 text-fluid-sm text-muted-foreground">
          Trusted by thousands of job seekers worldwide
        </motion.p>
      </motion.div>
    </section>
  )
}
