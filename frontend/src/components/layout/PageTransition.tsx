import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, pageFadeReduced, EASE, type TransitionKind } from "@/lib/motion";

/**
 * Moment 6: page transitions differentiated by route category. `forward` (core flow:
 * upload → processing → results) rises in; `fade` (landing, auth, lists) is the gentle
 * settle. The variants live once in lib/motion — this component just picks one by `kind`.
 * Reduced motion collapses every kind to a plain opacity fade. ≤0.3s; exit keeps the
 * existing easeInOut feel.
 */
const PageTransition = ({
  children,
  kind = "fade",
}: {
  children: React.ReactNode;
  kind?: TransitionKind;
}) => {
  const reduce = useReducedMotion() ?? false;
  const variants = reduce ? pageFadeReduced : pageVariants[kind];
  return (
    <motion.div
      // `col-start-1 row-start-1` places every page in the single grid cell of the parent
      // (see App.tsx). During a crossfade the outgoing and incoming pages are both mounted;
      // sharing one cell makes them overlap instead of stacking, so the page height never
      // jumps mid-transition.
      className="col-start-1 row-start-1"
      variants={variants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.div>
  );
};

export default PageTransition;
