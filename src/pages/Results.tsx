import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FloatingCard } from "@/components/FloatingCard";
import { RedFlagTag } from "@/components/RedFlagTag";
import { SalaryMeter } from "@/components/SalaryMeter";
import { NegotiationCard } from "@/components/NegotiationCard";
import { LoadingScreen } from "@/components/LoadingScreen";
import { ProgressSteps } from "@/components/ProgressSteps";
import { Nav } from "@/components/NavLink";
import { useOffer } from "@/context/OfferContext";
import { detectRedFlags, DetectedRedFlag } from "@/lib/redFlagRules";
import { getSalaryComparison, calculateTakeHome } from "@/lib/salaryData";
import { generateNegotiationSuggestions, NegotiationSuggestion } from "@/lib/negotiationRules";
import {
  FileText,
  Shield,
  TrendingUp,
  Wallet,
  Target,
  RefreshCw,
  CheckCircle,
} from "lucide-react";

export default function Results() {
  const navigate = useNavigate();
  const { offerData, clearOfferData } = useOffer();
  const [isLoading, setIsLoading] = useState(true);
  const [redFlags, setRedFlags] = useState<DetectedRedFlag[]>([]);
  const [salaryComparison, setSalaryComparison] = useState<ReturnType<typeof getSalaryComparison> | null>(null);
  const [takeHome, setTakeHome] = useState(0);
  const [suggestions, setSuggestions] = useState<NegotiationSuggestion[]>([]);

  useEffect(() => {
    if (!offerData) {
      navigate("/upload");
      return;
    }
  }, [offerData, navigate]);

  const handleLoadingComplete = () => {
    if (!offerData) return;

    // Run analysis
    const flags = detectRedFlags(offerData.offerText);
    setRedFlags(flags);

    const comparison = getSalaryComparison(
      offerData.role,
      offerData.experience,
      offerData.ctc
    );
    setSalaryComparison(comparison);

    const monthly = calculateTakeHome(offerData.ctc);
    setTakeHome(monthly);

    const negotiationSuggestions = generateNegotiationSuggestions(
      flags,
      comparison.comparison,
      comparison.difference,
      comparison.range,
      offerData.ctc
    );
    setSuggestions(negotiationSuggestions);

    setIsLoading(false);
  };

  const handleAnalyzeAnother = () => {
    clearOfferData();
    navigate("/upload");
  };

  if (!offerData) return null;

  if (isLoading) {
    return <LoadingScreen onComplete={handleLoadingComplete} />;
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-IN", {
      style: "currency",
      currency: "INR",
      maximumFractionDigits: 0,
    }).format(amount);
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav>
        <Button variant="soft" size="sm" onClick={handleAnalyzeAnother} className="min-h-[40px]">
          <RefreshCw className="w-4 h-4" />
          <span className="hidden sm:inline">New Analysis</span>
        </Button>
      </Nav>

      {/* Main Content */}
      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-3xl">
          {/* Progress Steps */}
          <ProgressSteps currentStep={3} />

          {/* Page Title */}
          <div className="mb-6 sm:mb-8 text-center opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-success/10 mb-3 sm:mb-4">
              <CheckCircle className="w-7 h-7 sm:w-8 sm:h-8 text-success" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Analysis Complete
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              {offerData.role} • {offerData.experience} • {offerData.ctc} LPA
            </p>
          </div>

          {/* Results Cards */}
          <div className="space-y-4 sm:space-y-6">
            {/* Card 1 - Offer Summary */}
            <FloatingCard
              header="Extracted Offer Summary"
              icon={<FileText className="w-5 h-5" />}
              delay={100}
            >
              <div className="max-h-40 sm:max-h-48 overflow-y-auto rounded-xl bg-secondary/50 p-3 sm:p-4 text-xs sm:text-sm text-muted-foreground leading-relaxed no-scrollbar">
                <pre className="whitespace-pre-wrap font-sans">
                  {offerData.offerText}
                </pre>
              </div>
            </FloatingCard>

            {/* Card 2 - Red Flag Scanner */}
            <FloatingCard
              header="Red Flag Scanner"
              icon={<Shield className="w-5 h-5" />}
              delay={200}
            >
              {redFlags.length > 0 ? (
                <div className="space-y-3">
                  {redFlags.map((flag, index) => (
                    <RedFlagTag
                      key={flag.id}
                      severity={flag.severity}
                      title={flag.title}
                      description={flag.description}
                      delay={250 + index * 50}
                    />
                  ))}
                </div>
              ) : (
                <div className="p-4 rounded-xl bg-success/10 text-success flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 shrink-0" />
                  <p className="font-medium text-sm sm:text-base">
                    No red flags detected in your offer letter!
                  </p>
                </div>
              )}
            </FloatingCard>

            {/* Card 3 - Market Salary Comparison */}
            {salaryComparison && (
              <FloatingCard
                header="Market Salary Comparison"
                icon={<TrendingUp className="w-5 h-5" />}
                delay={300}
              >
                <SalaryMeter
                  min={salaryComparison.range.min}
                  avg={salaryComparison.range.avg}
                  max={salaryComparison.range.max}
                  offered={offerData.ctc}
                  comparison={salaryComparison.comparison}
                  message={salaryComparison.message}
                />
              </FloatingCard>
            )}

            {/* Card 4 - Estimated Take-Home */}
            <FloatingCard
              header="Estimated Take-Home Salary"
              icon={<Wallet className="w-5 h-5" />}
              delay={400}
            >
              <div className="text-center py-4 sm:py-6">
                <div className="text-4xl sm:text-5xl mb-2">💰</div>
                <p className="text-xs sm:text-sm text-muted-foreground mb-2">
                  Monthly Take-Home (approx.)
                </p>
                <p className="text-3xl sm:text-4xl font-bold text-foreground">
                  {formatCurrency(takeHome)}
                </p>
                <p className="text-xs text-muted-foreground mt-2 sm:mt-3">
                  Based on ~70% take-home ratio after deductions
                </p>
              </div>
            </FloatingCard>

            {/* Card 5 - Negotiation Blueprint */}
            <FloatingCard
              header="Negotiation Blueprint"
              icon={<Target className="w-5 h-5" />}
              delay={500}
            >
              <div className="space-y-3">
                {suggestions.map((suggestion, index) => (
                  <NegotiationCard
                    key={suggestion.id}
                    suggestion={suggestion}
                    delay={550 + index * 50}
                  />
                ))}
              </div>
            </FloatingCard>

            {/* Analyze Another Button */}
            <div className="pt-2 sm:pt-4 opacity-0 animate-fade-in-up" style={{ animationDelay: "700ms", animationFillMode: "forwards" }}>
              <Button
                variant="outline"
                size="lg"
                className="w-full min-h-[48px]"
                onClick={handleAnalyzeAnother}
              >
                <RefreshCw className="w-4 h-4" />
                Analyze Another Offer
              </Button>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="py-6 sm:py-8 border-t border-border">
        <div className="container mx-auto px-4 sm:px-6 text-center text-xs sm:text-sm text-muted-foreground">
          <p>OfferLens • Decode your offer with confidence</p>
        </div>
      </footer>
    </div>
  );
}
