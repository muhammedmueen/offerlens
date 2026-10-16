import type { Variants, Transition } from "framer-motion";

/**
 * Shared motion language for the approved six-moment pass (.agents/tasks/offerlens-motion-spec.md).
 * One place for the easing, durations and variants so every moment reads as one language and
 * reduced-motion is honoured by construction. No moment invents its own curve.
 */

// The landing's existing ease-out quad (Index.tsx) — reused verbatim so nothing new is invented.
export const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/** Section-enter: fade + 12px rise, 0.5s, once. Reduced motion → opacity only (no rise). */
export const sectionEnter = (reduce: boolean) => ({
  initial: reduce ? { opacity: 0 } : { opacity: 0, y: 12 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, amount: 0.2 } as const,
  transition: { duration: 0.5, ease: EASE } as Transition,
});

/** Red-flags stagger container. Reduced motion → no per-child delay (all appear together). */
export const flagsContainer = (reduce: boolean): Variants => ({
  hidden: {},
  visible: {
    transition: { staggerChildren: reduce ? 0 : 0.07 },
  },
});

/** A single staggered flag item: fade + 8px rise. Reduced motion → opacity only. */
export const flagItem = (reduce: boolean): Variants => ({
  hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 8 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE } },
});

/**
 * Page-transition variants, defined ONCE here (not re-declared per page). Keyed by route
 * category; the component picks one by `kind`. Reduced motion collapses every kind to the
 * plain opacity fade (see PageTransition).
 */
export type TransitionKind = "forward" | "fade";

export const pageVariants: Record<TransitionKind, Variants> = {
  // Core-flow advance (upload → processing → results): a small rise forward.
  forward: {
    initial: { opacity: 0, y: 16 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
  // Default / lateral (landing, auth, lists): the existing gentle settle.
  fade: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -8 },
  },
};

/** Reduced-motion page transition: one plain opacity fade for every route. */
export const pageFadeReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
