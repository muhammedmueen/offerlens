"use client"

import { useReducedMotion } from "framer-motion"
import type { Variants } from "framer-motion"

/**
 * Custom hook for consistent animation variants across the application
 * Requirement 9.1: Home page load animations
 * Requirement 9.3: Reduced motion support
 */
export function useAnimations() {
  const shouldReduceMotion = useReducedMotion()

  // Fade in animation
  const fadeIn: Variants = {
    hidden: { 
      opacity: 0 
    },
    visible: { 
      opacity: 1,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.5,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Fade up animation
  const fadeUp: Variants = {
    hidden: { 
      opacity: 0, 
      y: shouldReduceMotion ? 0 : 20 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.5,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Scale in animation
  const scaleIn: Variants = {
    hidden: { 
      opacity: 0, 
      scale: shouldReduceMotion ? 1 : 0.95 
    },
    visible: { 
      opacity: 1, 
      scale: 1,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Slide in from left
  const slideInLeft: Variants = {
    hidden: { 
      opacity: 0, 
      x: shouldReduceMotion ? 0 : -30 
    },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.5,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Slide in from right
  const slideInRight: Variants = {
    hidden: { 
      opacity: 0, 
      x: shouldReduceMotion ? 0 : 30 
    },
    visible: { 
      opacity: 1, 
      x: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.5,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Stagger container
  const staggerContainer: Variants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: shouldReduceMotion ? 0 : 0.1,
        delayChildren: shouldReduceMotion ? 0 : 0.1,
      }
    }
  }

  // Stagger item
  const staggerItem: Variants = {
    hidden: { 
      opacity: 0, 
      y: shouldReduceMotion ? 0 : 20 
    },
    visible: { 
      opacity: 1, 
      y: 0,
      transition: {
        duration: shouldReduceMotion ? 0.01 : 0.4,
        ease: [0.25, 0.1, 0.25, 1],
      }
    }
  }

  // Hover scale animation config
  const hoverScale = shouldReduceMotion ? {} : {
    whileHover: { scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: { type: "spring", stiffness: 400, damping: 17 }
  }

  // Hover lift animation config
  const hoverLift = shouldReduceMotion ? {} : {
    whileHover: { y: -2 },
    whileTap: { y: 0 },
    transition: { type: "spring", stiffness: 400, damping: 17 }
  }

  // Click feedback animation config
  const clickFeedback = shouldReduceMotion ? {} : {
    whileTap: { scale: 0.98 },
    transition: { duration: 0.1 }
  }

  return {
    shouldReduceMotion,
    variants: {
      fadeIn,
      fadeUp,
      scaleIn,
      slideInLeft,
      slideInRight,
      staggerContainer,
      staggerItem,
    },
    interactions: {
      hoverScale,
      hoverLift,
      clickFeedback,
    }
  }
}
