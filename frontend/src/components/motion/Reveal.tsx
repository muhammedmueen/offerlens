import { motion, useReducedMotion } from "framer-motion";
import { sectionEnter } from "@/lib/motion";

/**
 * One shared reveal-on-scroll wrapper for the motion pass (Moments 4 & 5): gentle fade + 12px
 * rise when a block scrolls into view, once. Reduced motion collapses to opacity-only via
 * `sectionEnter`. Renders a `motion.div` by default; pass `as="section"` to keep semantics.
 *
 * ponytail: a single wrapper instead of copy-pasting `whileInView` props onto every block.
 */
const Reveal = ({
  children,
  className,
  as = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) => {
  const reduce = useReducedMotion() ?? false;
  const Comp = as === "section" ? motion.section : motion.div;
  return (
    <Comp className={className} {...sectionEnter(reduce)}>
      {children}
    </Comp>
  );
};

export default Reveal;
