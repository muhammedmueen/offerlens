"use client"

import Link from "next/link"
import { motion } from "framer-motion"
import { Home } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useEffect } from "react"

export default function NotFound() {
  // Set page title for 404 page
  useEffect(() => {
    document.title = "Page Not Found | OfferLens"
  }, [])
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4">
      {/* Logo */}
      <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <Link href="/" className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary text-primary-foreground font-bold">
            OL
          </div>
          <span className="font-semibold text-xl">OfferLens</span>
        </Link>
      </motion.div>

      {/* Content */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="text-center"
      >
        <motion.h1
          initial={{ scale: 0.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 200, damping: 15, delay: 0.2 }}
          className="text-8xl font-bold text-primary mb-4"
        >
          404
        </motion.h1>
        <h2 className="text-2xl font-semibold mb-2">Page Not Found</h2>
        <p className="text-muted-foreground mb-8 max-w-md">
          The page you&apos;re looking for doesn&apos;t exist or has been moved to a different location.
        </p>
        <Link href="/">
          <Button size="lg" className="gap-2">
            <Home className="h-4 w-4" />
            Back to Home
          </Button>
        </Link>
      </motion.div>
    </div>
  )
}
