import type { Variants, Transition } from "framer-motion";

/**
 * Shared motion language for the approved six-moment pass (.agents/tasks/offerlens-motion-spec.md).
 * One place for the easing, durations and variants so every moment reads as one language and
 * reduced-motion is honoured by construction. No moment invents its own curve.
 */

// The landing's existing ease-out quad (Index.tsx) — reused verbatim so nothing new is invented.
export const EASE = [0.25, 0.46, 0.45, 0.94] as const;

/**
 * Section-enter: a calm, CONSISTENT fade + 20px rise, 0.5s, once — fires when the block is
 * clearly entering (amount 0.3). Visible-but-restrained SaaS feel, not theatrical. Optional
 * `delay` for light sequencing of a few siblings. Reduced motion → opacity only, instant
 * (no rise, no transition).
 */
export const sectionEnter = (reduce: boolean, delay = 0) =>
  reduce
    ? {
        initial: { opacity: 0 },
        whileInView: { opacity: 1 },
        viewport: { once: true, amount: 0.3 } as const,
        transition: { duration: 0 } as Transition,
      }
    : {
        initial: { opacity: 0, y: 20 },
        whileInView: { opacity: 1, y: 0 },
        viewport: { once: true, amount: 0.3 } as const,
        transition: { duration: 0.5, ease: EASE, delay } as Transition,
      };

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

// A plain opacity fade on every route — the owner chose a uniform, calm page transition over
// the earlier directional (rise) variant. Both kinds resolve to the same fade so route-level
// `kind` props need no change; the distinction is kept in the type for a possible future use.
const pageFade: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export const pageVariants: Record<TransitionKind, Variants> = {
  forward: pageFade,
  fade: pageFade,
};

/** Reduced-motion page transition: one plain opacity fade for every route. */
export const pageFadeReduced: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};
