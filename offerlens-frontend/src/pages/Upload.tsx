import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { FileUpload } from "@/components/FileUpload";
import { ProgressSteps } from "@/components/ProgressSteps";
import { Nav } from "@/components/NavLink";
import { useOffer } from "@/context/OfferContext";
import { roles, experienceLevels, cities } from "@/lib/salaryData";
import { sampleOfferText, sampleOfferData } from "@/lib/sampleOffer";
import { ArrowLeft, ArrowRight, AlertCircle, Sparkles } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Upload() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { analyzeOfferData, isAnalyzing, analysisError, analysisResult } = useOffer();
  const { toast } = useToast();

  const [offerText, setOfferText] = useState("");
  const [role, setRole] = useState("");
  const [experience, setExperience] = useState("");
  const [city, setCity] = useState("Bangalore");
  const [ctc, setCtc] = useState("");
  const [fileName, setFileName] = useState<string | undefined>();
  const [extractedFromFile, setExtractedFromFile] = useState(false);

  // Handle demo mode
  useEffect(() => {
    if (searchParams.get("demo") === "true") {
      setOfferText(sampleOfferText);
      setRole(sampleOfferData.role);
      setExperience(sampleOfferData.experience);
      setCity(sampleOfferData.city);
      setCtc(sampleOfferData.ctc.toString());
      toast({
        title: "Sample offer loaded",
        description: "We've loaded a sample offer letter with red flags for you to explore.",
      });
    }
  }, [searchParams, toast]);

  const handleTextExtracted = (text: string, name: string) => {
    if (!offerText) {
      setOfferText(text);
      setExtractedFromFile(true);
    }
    setFileName(name);
    toast({
      title: "File processed",
      description: "Text extracted from your file. You can edit it below.",
    });
  };

  const handleFileError = (error: string) => {
    toast({
      variant: "destructive",
      title: "Error",
      description: error,
    });
  };

  const handleAnalyze = async (e?: React.MouseEvent<HTMLButtonElement>) => {
    console.log("🔵 handleAnalyze called");
    
    // Prevent default form submission if event exists
    if (e) {
      console.log("🔵 Preventing default event behavior");
      e.preventDefault();
      e.stopPropagation();
    }

    // Validation
    if (!offerText.trim()) {
      console.log("🔴 Validation failed: Missing offer text");
      toast({
        variant: "destructive",
        title: "Missing offer text",
        description: "Please upload a file or paste your offer text.",
      });
      return;
    }

    if (!role) {
      console.log("🔴 Validation failed: Missing role");
      toast({
        variant: "destructive",
        title: "Select role",
        description: "Please select your role from the dropdown.",
      });
      return;
    }

    if (!experience) {
      console.log("🔴 Validation failed: Missing experience");
      toast({
        variant: "destructive",
        title: "Select experience",
        description: "Please select your experience level.",
      });
      return;
    }

    if (!city) {
      console.log("🔴 Validation failed: Missing city");
      toast({
        variant: "destructive",
        title: "Select city",
        description: "Please select your city.",
      });
      return;
    }

    if (!ctc || parseFloat(ctc) <= 0) {
      console.log("🔴 Validation failed: Invalid CTC");
      toast({
        variant: "destructive",
        title: "Enter CTC",
        description: "Please enter your offered CTC in LPA.",
      });
      return;
    }

    console.log("✅ Validation passed, starting analysis...");

    try {
      // Call backend API to analyze offer
      console.log("🔵 Calling analyzeOfferData...");
      await analyzeOfferData({
        offerText: offerText.trim(),
        role,
        experience,
        city,
        ctc: parseFloat(ctc),
        fileName,
      });

      console.log("✅ Analysis successful, navigating to results...");
      
      // Navigate to results on success (only if no error was thrown)
      navigate("/results");
    } catch (error) {
      // Error is already handled in the context and set in analysisError state
      console.error("🔴 Analysis failed:", error);
      
      // Just show a toast notification here
      toast({
        variant: "destructive",
        title: "Analysis failed",
        description: analysisError || "An error occurred during analysis. Please try again.",
      });
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />

      {/* Main Content */}
      <main className="pt-20 sm:pt-24 pb-12 sm:pb-16">
        <div className="container mx-auto px-4 sm:px-6 max-w-2xl">
          {/* Back Link */}
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground mb-6 sm:mb-8 transition-colors min-h-[44px]"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          {/* Progress Steps */}
          <ProgressSteps currentStep={1} />

          {/* Page Title */}
          <div className="mb-6 sm:mb-8 opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
              Upload Your Offer
            </h1>
            <p className="text-sm sm:text-base text-muted-foreground">
              Share your offer details and we'll analyze it for you
            </p>
          </div>

          {/* Demo Banner */}
          {searchParams.get("demo") === "true" && (
            <div className="mb-6 p-4 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-3 opacity-0 animate-fade-in" style={{ animationFillMode: "forwards" }}>
              <Sparkles className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-primary text-sm sm:text-base">Sample Offer Loaded</p>
                <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                  This is a sample offer letter with several red flags. Edit or scroll down to analyze.
                </p>
              </div>
            </div>
          )}

          {/* Form */}
          <div className="space-y-4 sm:space-y-6">
            {/* File Upload */}
            <div className="floating-card opacity-0 animate-fade-in-up" style={{ animationDelay: "100ms", animationFillMode: "forwards" }}>
              <h2 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">
                Upload Offer Letter
              </h2>
              <FileUpload
                onTextExtracted={handleTextExtracted}
                onError={handleFileError}
              />
            </div>

            {/* Text Area */}
            <div className="floating-card opacity-0 animate-fade-in-up" style={{ animationDelay: "200ms", animationFillMode: "forwards" }}>
              <h2 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">
                Or Paste Offer Text
              </h2>
              <textarea
                value={offerText}
                onChange={(e) => {
                  setOfferText(e.target.value);
                  setExtractedFromFile(false);
                }}
                placeholder="Paste your offer letter content here..."
                className="w-full h-32 sm:h-40 p-3 sm:p-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none resize-none transition-all text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
                maxLength={50000}
              />
              {extractedFromFile && offerText && (
                <p className="text-xs text-muted-foreground mt-2 flex items-center gap-1">
                  <AlertCircle className="w-3 h-3" />
                  Text extracted from {fileName}. Edit as needed.
                </p>
              )}
            </div>

            {/* Details Form */}
            <div className="floating-card opacity-0 animate-fade-in-up" style={{ animationDelay: "300ms", animationFillMode: "forwards" }}>
              <h2 className="font-semibold text-foreground mb-3 sm:mb-4 text-sm sm:text-base">
                Offer Details
              </h2>

              <div className="grid gap-4">
                {/* Role */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Role
                  </label>
                  <select
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground appearance-none cursor-pointer text-sm sm:text-base"
                  >
                    <option value="" className="text-muted-foreground">
                      Select role...
                    </option>
                    {roles.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Experience */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Experience
                  </label>
                  <select
                    value={experience}
                    onChange={(e) => setExperience(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground appearance-none cursor-pointer text-sm sm:text-base"
                  >
                    <option value="" className="text-muted-foreground">
                      Select experience...
                    </option>
                    {experienceLevels.map((e) => (
                      <option key={e} value={e}>
                        {e}
                      </option>
                    ))}
                  </select>
                </div>

                {/* City */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Location
                  </label>
                  <select
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground appearance-none cursor-pointer text-sm sm:text-base"
                  >
                    {cities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                {/* CTC */}
                <div>
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Offered CTC (in LPA)
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min="0"
                    max="500"
                    value={ctc}
                    onChange={(e) => setCtc(e.target.value)}
                    placeholder="e.g., 8.5"
                    className="w-full h-12 px-4 rounded-xl bg-secondary/50 border border-border focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition-all text-foreground placeholder:text-muted-foreground text-sm sm:text-base"
                  />
                </div>
              </div>
            </div>

            {/* Submit Button */}
            <div className="opacity-0 animate-fade-in-up" style={{ animationDelay: "400ms", animationFillMode: "forwards" }}>
              <Button
                variant="hero"
                size="xl"
                className="w-full group min-h-[52px]"
                onClick={handleAnalyze}
                disabled={isAnalyzing}
              >
                {isAnalyzing ? "Analyzing..." : "Analyze Offer"}
                {!isAnalyzing && <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />}
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
