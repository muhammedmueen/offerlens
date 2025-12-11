import { cn } from "@/lib/utils";
import { AlertTriangle, AlertCircle, Info } from "lucide-react";
import { Severity } from "@/lib/redFlagRules";

interface RedFlagTagProps {
  severity: Severity;
  title: string;
  description: string;
  delay?: number;
}

const severityConfig = {
  high: {
    icon: AlertTriangle,
    containerClass: "tag-high",
    iconClass: "text-destructive",
    label: "High Risk",
  },
  medium: {
    icon: AlertCircle,
    containerClass: "tag-medium",
    iconClass: "text-warning",
    label: "Medium Risk",
  },
  low: {
    icon: Info,
    containerClass: "tag-low",
    iconClass: "text-caution",
    label: "Low Risk",
  },
};

export function RedFlagTag({ severity, title, description, delay = 0 }: RedFlagTagProps) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <div
      className={cn(
        "p-4 rounded-xl opacity-0 animate-scale-in",
        config.containerClass
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5", config.iconClass)}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <h4 className="font-semibold">{title}</h4>
            <span className="text-xs px-2 py-0.5 rounded-full bg-current/10">
              {config.label}
            </span>
          </div>
          <p className="text-sm opacity-80">{description}</p>
        </div>
      </div>
    </div>
  );
}
