import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface FloatingCardProps {
  children: ReactNode;
  className?: string;
  header?: string;
  icon?: ReactNode;
  delay?: number;
}

export function FloatingCard({
  children,
  className,
  header,
  icon,
  delay = 0,
}: FloatingCardProps) {
  return (
    <div
      className={cn(
        "floating-card opacity-0 animate-fade-in-up",
        className
      )}
      style={{ animationDelay: `${delay}ms`, animationFillMode: "forwards" }}
    >
      {header && (
        <div className="flex items-center gap-3 mb-4">
          {icon && (
            <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-primary/10 text-primary">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-semibold text-foreground">{header}</h3>
        </div>
      )}
      {children}
    </div>
  );
}
