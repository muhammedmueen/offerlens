import { useEffect, useState } from "react";
import { Search, Shield, TrendingUp, FileCheck } from "lucide-react";

const steps = [
  { icon: FileCheck, text: "Parsing offer details..." },
  { icon: Search, text: "Scanning for red flags..." },
  { icon: TrendingUp, text: "Comparing with market data..." },
  { icon: Shield, text: "Generating negotiation strategy..." },
];

interface LoadingScreenProps {
  onComplete: () => void;
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentStep((prev) => {
        if (prev >= steps.length - 1) {
          clearInterval(interval);
          setTimeout(onComplete, 500);
          return prev;
        }
        return prev + 1;
      });
    }, 800);

    return () => clearInterval(interval);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 bg-background z-50 flex items-center justify-center">
      <div className="text-center max-w-md px-6">
        {/* Animated Logo */}
        <div className="relative w-20 h-20 mx-auto mb-8">
          <div className="absolute inset-0 rounded-2xl bg-primary/20 animate-pulse" />
          <div className="absolute inset-2 rounded-xl bg-primary/40 animate-pulse" style={{ animationDelay: "150ms" }} />
          <div className="absolute inset-4 rounded-lg bg-primary flex items-center justify-center">
            <Search className="w-6 h-6 text-primary-foreground" />
          </div>
        </div>

        <h2 className="text-2xl font-semibold text-foreground mb-2">
          Analyzing Your Offer
        </h2>
        <p className="text-muted-foreground mb-8">
          Please wait while we review your offer letter
        </p>

        {/* Progress Steps */}
        <div className="space-y-3">
          {steps.map((step, index) => {
            const Icon = step.icon;
            const isActive = index === currentStep;
            const isComplete = index < currentStep;

            return (
              <div
                key={index}
                className={`flex items-center gap-3 p-3 rounded-xl transition-all duration-300 ${
                  isActive
                    ? "bg-primary/10 text-primary"
                    : isComplete
                    ? "text-muted-foreground"
                    : "text-muted-foreground/40"
                }`}
              >
                <div
                  className={`w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : isComplete
                      ? "bg-success/20 text-success"
                      : "bg-muted"
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>
                <span className={`text-sm font-medium ${isActive ? "animate-pulse-soft" : ""}`}>
                  {step.text}
                </span>
                {isComplete && (
                  <span className="ml-auto text-success text-xs">✓</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
