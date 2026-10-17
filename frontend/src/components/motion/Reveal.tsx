import { motion, useReducedMotion } from "framer-motion";
import { sectionEnter } from "@/lib/motion";

/**
 * One shared reveal-on-scroll wrapper: a gentle, consistent fade + 20px rise the first time a
 * block scrolls into view (calm SaaS feel). `delay` lightly sequences a few siblings. Reduced
 * motion collapses to opacity-only, instant (no rise, no transition) via `sectionEnter`.
 * Renders a `motion.div` by default; pass `as="section"` to keep semantics.
 *
 * ponytail: a single wrapper instead of copy-pasting `whileInView` props onto every block.
 */
const Reveal = ({
  children,
  className,
  as = "div",
  delay = 0,
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
  delay?: number;
}) => {
  const reduce = useReducedMotion() ?? false;
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp className={className} {...sectionEnter(reduce, delay)}>
      {children}
    </Comp>
  );
};

export default Reveal;
