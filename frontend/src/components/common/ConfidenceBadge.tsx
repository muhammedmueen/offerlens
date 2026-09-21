import { ShieldCheck, ShieldAlert, ShieldQuestion } from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

export type ConfidenceLevel = "high" | "medium" | "low";

interface ConfidenceBadgeProps {
  level: ConfidenceLevel;
  /** Why it scored that way. Shown on hover and to screen readers. */
  reason: string;
  /** What the badge is about, so the accessible name is not just "medium confidence". */
  label: string;
}

/**
 * Trust indicator for one field.
 *
 * Deliberately shows the REASON, not just the level. "Medium confidence" on its own tells a
 * candidate nothing they can act on; "stated with a magnitude word, so the full figure is
 * expanded rather than copied" tells them exactly what to double-check against their letter.
 *
 * Colour is never the only signal — each level has its own icon and its own text — so this
 * survives greyscale and colour blindness.
 */
const STYLES: Record<ConfidenceLevel, { icon: typeof ShieldCheck; className: string; word: string }> = {
  high: { icon: ShieldCheck, className: "text-green-600", word: "Verified" },
  medium: { icon: ShieldQuestion, className: "text-yellow-600", word: "Check this" },
  low: { icon: ShieldAlert, className: "text-red-600", word: "Unverified" },
};

const ConfidenceBadge: React.FC<ConfidenceBadgeProps> = ({ level, reason, label }) => {
  const { icon: Icon, className, word } = STYLES[level] ?? STYLES.medium;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={`inline-flex items-center gap-1 text-xs font-medium ${className}`}
          // The tooltip is hover/focus only, so the reason is also part of the accessible
          // name — otherwise a screen reader gets the level with no explanation.
          aria-label={`${label}: ${word}. ${reason}`}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {word}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <p className="text-xs">{reason}</p>
      </TooltipContent>
    </Tooltip>
  );
};

export default ConfidenceBadge;
