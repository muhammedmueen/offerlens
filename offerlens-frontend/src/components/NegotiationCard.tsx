import { cn } from "@/lib/utils";
import { NegotiationSuggestion } from "@/lib/negotiationRules";

interface NegotiationCardProps {
  suggestion: NegotiationSuggestion;
  delay?: number;
}

const priorityConfig = {
  high: {
    badge: "Priority",
    badgeClass: "bg-destructive/10 text-destructive",
    borderClass: "border-l-destructive",
  },
  medium: {
    badge: "Recommended",
    badgeClass: "bg-warning/10 text-warning",
    borderClass: "border-l-warning",
  },
  low: {
    badge: "Optional",
    badgeClass: "bg-muted text-muted-foreground",
    borderClass: "border-l-muted-foreground",
  },
};

export function NegotiationCard({ suggestion, delay = 0 }: NegotiationCardProps) {
  const config = priorityConfig[suggestion.priority];

  return (
    <div
      className={cn(
        "p-4 rounded-xl bg-secondary/50 border-l-4 opacity-0 animate-fade-in-up",
        config.borderClass
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl">{suggestion.icon}</span>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <h4 className="font-semibold text-foreground">{suggestion.title}</h4>
            <span className={cn("text-xs px-2 py-0.5 rounded-full", config.badgeClass)}>
              {config.badge}
            </span>
            <span className="text-xs text-muted-foreground px-2 py-0.5 rounded-full bg-muted">
              {suggestion.category}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {suggestion.suggestion}
          </p>
        </div>
      </div>
    </div>
  );
}
