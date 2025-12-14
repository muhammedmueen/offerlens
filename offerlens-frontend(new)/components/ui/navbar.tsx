"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"
import { motion, useReducedMotion } from "framer-motion"
import { Menu, X } from "lucide-react"
import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/theme-toggle"
import { cn } from "@/lib/utils"

export function Navbar() {
  const pathname = usePathname()
  const shouldReduceMotion = useReducedMotion()
  const [isOpen, setIsOpen] = useState(false)
  const [isScrolled, setIsScrolled] = useState(false)
  const [scrollDirection, setScrollDirection] = useState<"up" | "down">("up")
  const [lastScrollY, setLastScrollY] = useState(0)

  const isHome = pathname === "/"

  // Requirement 9.5: Scroll-based navbar updates
  useEffect(() => {
    const handleScroll = () => {
      const currentScrollY = window.scrollY
      
      // Update scrolled state
      setIsScrolled(currentScrollY > 20)
      
      // Update scroll direction
      if (currentScrollY > lastScrollY && currentScrollY > 100) {
        setScrollDirection("down")
      } else {
        setScrollDirection("up")
      }
      
      setLastScrollY(currentScrollY)
    }
    
    window.addEventListener("scroll", handleScroll, { passive: true })
    return () => window.removeEventListener("scroll", handleScroll)
  }, [lastScrollY])

  return (
    <>
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      <motion.header
        initial={shouldReduceMotion ? { opacity: 1 } : { y: -20, opacity: 0 }}
        animate={{ 
          y: shouldReduceMotion ? 0 : (scrollDirection === "down" && isScrolled ? -100 : 0), 
          opacity: 1 
        }}
        transition={{
          duration: shouldReduceMotion ? 0 : 0.3,
          ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
        }}
        className={cn(
          "fixed top-0 left-0 right-0 z-50 border-b transition-smooth",
          isScrolled ? "glass-heavy shadow-md" : "glass-light",
          "supports-[backdrop-filter]:bg-background/60",
        )}
        role="banner"
      >
        <nav className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6" aria-label="Main navigation">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-lg"
            aria-label="OfferLens home"
          >
            <motion.div
              whileHover={shouldReduceMotion ? {} : { scale: 1.05 }}
              whileTap={shouldReduceMotion ? {} : { scale: 0.95 }}
              className="flex items-center gap-2"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-primary text-primary-foreground font-bold text-fluid-sm shadow-primary-sm" aria-hidden="true">
                OL
              </div>
              <span className="font-semibold text-fluid-lg">OfferLens</span>
            </motion.div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-2 md:flex" role="navigation" aria-label="Desktop navigation">
            <Link href="/forum">
              <Button variant="ghost" size="sm" className="interactive" aria-label="Go to forum">
                Forum
              </Button>
            </Link>
            <ThemeToggle />
            {!isHome && (
              <Link href="/upload">
                <Button size="sm" className="shadow-primary-sm transition-smooth hover:shadow-primary-md" aria-label="Analyze your offer">
                  Analyze Offer
                </Button>
              </Link>
            )}
          </div>

          {/* Mobile Menu Button - Requirement 8.1, 8.5: Touch-friendly mobile controls */}
          <div className="flex items-center gap-2 md:hidden">
            <ThemeToggle />
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(!isOpen)}
              aria-label={isOpen ? "Close menu" : "Open menu"}
              aria-expanded={isOpen}
              className="interactive touch-target min-h-[44px] min-w-[44px]"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </nav>

        {/* Mobile Menu - Requirement 8.1: Mobile-optimized layout */}
        <motion.div
          initial={false}
          animate={{
            height: isOpen ? "auto" : 0,
            opacity: isOpen ? 1 : 0,
          }}
          transition={{
            duration: shouldReduceMotion ? 0 : 0.2,
            ease: [0.25, 0.1, 0.25, 1] as [number, number, number, number],
          }}
          className="overflow-hidden border-t md:hidden glass"
          role="navigation"
          aria-label="Mobile navigation"
          aria-hidden={!isOpen}
        >
          <div className="flex flex-col gap-2 p-4">
            <Link href="/forum" onClick={() => setIsOpen(false)} className="w-full">
              <Button 
                variant="ghost" 
                className="w-full justify-start interactive touch-target min-h-[44px]"
                aria-label="Go to forum"
              >
                Forum
              </Button>
            </Link>
            <Link href="/upload" onClick={() => setIsOpen(false)} className="w-full">
              <Button className="w-full shadow-primary-sm touch-target min-h-[44px]" aria-label="Analyze your offer">
                Analyze Offer
              </Button>
            </Link>
          </div>
        </motion.div>
      </motion.header>
    </>
  )
}
