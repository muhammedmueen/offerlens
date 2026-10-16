import { useEffect, useRef } from "react";
import { animate, useMotionValue, useTransform, useReducedMotion } from "framer-motion";

/**
 * Drives the score gauge's one-shot reveal from a SINGLE motion value (Moment 1): the arc
 * sweep and the numeral count-up share `value`, so they finish in lockstep and nothing
 * re-renders the Results tree per frame (the motion value writes straight into the SVG datum
 * and a motion.span).
 *
 * - Plays once per `score` (guarded by a ref), ~0.7s, ease-out.
 * - Reduced motion: no sweep, no count-up — `value` is pinned to the final `score` so the arc
 *   and numeral render final from the first paint. The accessible final value is rendered
 *   separately in ScoreGauge regardless, so screen readers/tests never see 0.
 */
export function useGaugeCountUp(score: number) {
  const reduce = useReducedMotion() ?? false;
  const value = useMotionValue(reduce ? score : 0);
  // Integer numeral in lockstep with the arc (0 → 73), driven by the same source of truth.
  const display = useTransform(value, (v) => Math.round(v));
  const playedFor = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) {
      value.set(score);
      playedFor.current = score;
      return;
    }
    // Replay only when the score actually changes, not on every render.
    if (playedFor.current === score) return;
    playedFor.current = score;
    value.set(0);
    const controls = animate(value, score, { duration: 0.7, ease: [0.25, 0.46, 0.45, 0.94] });
    return () => controls.stop();
  }, [score, reduce, value]);

  return { value, display };
}
