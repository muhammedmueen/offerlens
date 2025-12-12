import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

interface SalaryMeterProps {
  min: number;
  avg: number;
  max: number;
  offered: number;
  comparison: "below" | "aligned" | "above";
  message: string;
}

export function SalaryMeter({
  min,
  avg,
  max,
  offered,
  comparison,
  message,
}: SalaryMeterProps) {
  // Calculate position on the scale (0-100%)
  const range = max - min;
  const position = Math.max(0, Math.min(100, ((offered - min) / range) * 100));
  const avgPosition = ((avg - min) / range) * 100;

  const comparisonConfig = {
    below: {
      icon: TrendingDown,
      bgClass: "bg-destructive/10",
      textClass: "text-destructive",
      barClass: "bg-destructive",
    },
    aligned: {
      icon: Minus,
      bgClass: "bg-success/10",
      textClass: "text-success",
      barClass: "bg-success",
    },
    above: {
      icon: TrendingUp,
      bgClass: "bg-success/10",
      textClass: "text-success",
      barClass: "bg-success",
    },
  };

  const config = comparisonConfig[comparison];
  const Icon = config.icon;

  return (
    <div className="space-y-6">
      {/* Market Range Display */}
      <div className="grid grid-cols-3 gap-4 text-center">
        <div className="p-3 rounded-xl bg-secondary">
          <p className="text-xs text-muted-foreground mb-1">Minimum</p>
          <p className="text-lg font-semibold">{min} LPA</p>
        </div>
        <div className="p-3 rounded-xl bg-primary/10">
          <p className="text-xs text-primary mb-1">Average</p>
          <p className="text-lg font-semibold text-primary">{avg} LPA</p>
        </div>
        <div className="p-3 rounded-xl bg-secondary">
          <p className="text-xs text-muted-foreground mb-1">Maximum</p>
          <p className="text-lg font-semibold">{max} LPA</p>
        </div>
      </div>

      {/* Visual Scale */}
      <div className="relative pt-8 pb-4">
        {/* Scale Bar */}
        <div className="h-2 rounded-full bg-secondary relative">
          {/* Progress Fill */}
          <div
            className={cn("h-full rounded-full transition-all duration-700", config.barClass)}
            style={{ width: `${position}%` }}
          />

          {/* Average Marker */}
          <div
            className="absolute top-1/2 -translate-y-1/2 w-1 h-4 bg-primary rounded-full"
            style={{ left: `${avgPosition}%` }}
          >
            <span className="absolute -top-6 left-1/2 -translate-x-1/2 text-xs text-primary whitespace-nowrap">
              Avg
            </span>
          </div>

          {/* Offered Position Marker */}
          <div
            className={cn(
              "absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full border-2 border-background transition-all duration-700",
              config.barClass
            )}
            style={{ left: `${position}%`, transform: "translate(-50%, -50%)" }}
          >
            <span className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-xs font-medium whitespace-nowrap">
              Your Offer
            </span>
          </div>
        </div>

        {/* Scale Labels */}
        <div className="flex justify-between mt-8 text-xs text-muted-foreground">
          <span>{min} LPA</span>
          <span>{max} LPA</span>
        </div>
      </div>

      {/* Comparison Result */}
      <div className={cn("p-4 rounded-xl flex items-center gap-3", config.bgClass)}>
        <Icon className={cn("w-5 h-5", config.textClass)} />
        <p className={cn("font-medium", config.textClass)}>{message}</p>
      </div>
    </div>
  );
}
