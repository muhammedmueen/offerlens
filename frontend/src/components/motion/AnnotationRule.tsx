import { motion, useReducedMotion } from "framer-motion";
import { EASE } from "@/lib/motion";

/**
 * Moment 5 (narrowed per approval): a thin cyan accent rule that "draws in" via scaleX from
 * its left edge when its section scrolls into view — the examination/annotation gesture,
 * without fragile leader-line anchor math or new SVG geometry. Decorative (aria-hidden).
 * Reduced motion: appears instantly at full width (no draw).
 *
 * ponytail: a 1px scaleX rule reused across SampleResult/WhatWeCheck instead of per-anchor
 * SVG paths — transform-only, GPU-friendly, one draw then rest.
 */
const AnnotationRule = ({ className = "" }: { className?: string }) => {
  const reduce = useReducedMotion() ?? false;
  return (
    <motion.span
      aria-hidden="true"
      className={`block h-px origin-left bg-cyan-700 ${className}`}
      initial={{ scaleX: reduce ? 1 : 0 }}
      whileInView={{ scaleX: 1 }}
      viewport={{ once: true, amount: 0.5 }}
      transition={reduce ? { duration: 0 } : { duration: 0.4, ease: EASE, delay: 0.15 }}
    />
  );
};

export default AnnotationRule;
