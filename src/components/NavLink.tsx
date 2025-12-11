import { Link } from "react-router-dom";
import { Search } from "lucide-react";
import { ThemeToggle } from "./ThemeToggle";
import { cn } from "@/lib/utils";
import { ReactNode } from "react";

interface NavProps {
  children?: ReactNode;
  className?: string;
  showThemeToggle?: boolean;
}

export function Nav({ children, className, showThemeToggle = true }: NavProps) {
  return (
    <header className={cn(
      "fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border/50",
      className
    )}>
      <div className="container mx-auto px-4 sm:px-6 h-14 sm:h-16 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-primary flex items-center justify-center">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-primary-foreground" />
          </div>
          <span className="font-semibold text-base sm:text-lg">OfferLens</span>
        </Link>
        <div className="flex items-center gap-2 sm:gap-3">
          {children}
          {showThemeToggle && <ThemeToggle />}
        </div>
      </div>
    </header>
  );
}
