import { motion, useReducedMotion } from "framer-motion";
import { pageVariants, pageFadeReduced, EASE, type TransitionKind } from "@/lib/motion";

/**
 * Page transition: a plain 0.3s opacity fade on every route (both `kind`s resolve to the
 * same fade in lib/motion). `col-start-1 row-start-1` puts every page in the single cell of
 * the grid in App.tsx, so during a navigation the exiting and entering pages overlap and
 * crossfade in place instead of stacking vertically.
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
