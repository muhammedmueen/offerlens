import { motion, useTransform } from "framer-motion";
import { useGaugeCountUp } from "./useGaugeCountUp";

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

// Single-band verdict colour (spec §7): one solid hue per band, no gradient.
// ≥70 green-700, 40–69 amber-700, <40 red-700 — the spec §3.2 honest semantic hexes.
// Computed once from the FINAL score and applied from frame 0 — colour is never animated.
const getColor = (score: number) => {
  if (score >= 70) return "#15803D";
  if (score >= 40) return "#B45309";
  return "#B91C1C";
};

// Full circle (startAngle 90 → endAngle -270 in the old recharts gauge); a 360° sweep.
const RADIUS = 42; // in a 100×100 viewBox, leaving room for the stroke width
const CIRC = 2 * Math.PI * RADIUS;

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, size = 180 }) => {
  const color = getColor(score);
  // Moment 1: ONE motion value is the single source of truth for both the arc sweep and the
  // numeral count-up (no recharts animation, no React re-render per frame). Reduced motion
  // pins it to the final score instantly.
  const { value, display } = useGaugeCountUp(score);
  // Arc length as a fraction of the full circle, 0 → score, in lockstep with the numeral.
  const dashoffset = useTransform(value, (v) => CIRC * (1 - v / 100));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      {/* The accessible final value, present from the first paint and never animated, so
          screen readers and tests read the FINAL number (e.g. 73), never a mid-sweep 0. */}
      <span className="sr-only" role="img" aria-label={`Score ${score} out of 100`} />

      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className="-rotate-90"
        aria-hidden="true"
      >
        {/* Track */}
        <circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="10"
        />
        {/* Value arc — swept by the shared motion value. */}
        <motion.circle
          cx="50"
          cy="50"
          r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={CIRC}
          style={{ strokeDashoffset: dashoffset }}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {/* Numeral counts up in lockstep with the arc; aria-hidden because the final value is
            already exposed via the sr-only node above. */}
        <motion.span
          className="text-4xl font-semibold tabular-nums tracking-tight"
          style={{ color }}
          aria-hidden="true"
        >
          {display}
        </motion.span>
        <span className="font-mono text-xs text-muted-foreground" aria-hidden="true">/ 100</span>
      </div>
    </div>
  );
};

export default ScoreGauge;
