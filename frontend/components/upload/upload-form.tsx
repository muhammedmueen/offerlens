"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Sparkles, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Stepper } from "@/components/ui/stepper"
import { FloatingCard } from "@/components/ui/floating-card"
import { UploadDropzone } from "@/components/ui/upload-dropzone"
import { cn } from "@/lib/utils"
import { trackFileUpload } from "@/lib/analytics"
import { useOffer } from "@/context/OfferContext"
import { useOfferUpload } from "@/hooks/use-offer-upload"
import { useEffect } from "react"

const steps = [{ label: "Upload" }, { label: "Details" }, { label: "Analyze" }]

export function UploadForm() {
  const router = useRouter()
  const { setOffer: setContextOffer } = useOffer()

  // Use new async upload hook
  const {
    upload,
    offer: asyncOffer,
    status: uploadStatus,
    progress: hookProgress,
    error: hookError,
    reset: resetUpload
  } = useOfferUpload()

  const [currentStep, setCurrentStep] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  // Form state
  const [file, setFile] = useState<File | null>(null)
  const [pastedText, setPastedText] = useState("")
  const [extractedText, setExtractedText] = useState("")
  const [offerDetails, setOfferDetails] = useState({
    role: "",
    experience: "",
    location: "",
    ctc: "",
  })

  // Sync extracted data from async upload to form
  useEffect(() => {
    if (asyncOffer?.extractedData) {
      const { jobTitle, location, baseSalary, rawText } = asyncOffer.extractedData;

      setOfferDetails(prev => ({
        ...prev,
        role: (jobTitle as string) || prev.role,
        location: (location as string) || prev.location,
        ctc: baseSalary ? String(baseSalary) : prev.ctc,
      }));

      if (rawText) {
        setExtractedText(rawText as string);
      }
    }
  }, [asyncOffer]);

  const hasContent = file || pastedText.trim().length > 0
  const hasDetails = offerDetails.role && offerDetails.experience && offerDetails.location && offerDetails.ctc
  const canProceed = currentStep === 0 ? hasContent : currentStep === 1 ? hasDetails : true

  // Derived states for UI
  const isUploading = uploadStatus === 'QUEUED' || uploadStatus === 'PROCESSING' || uploadStatus === 'UPLOADING';
  // Use hook error or 'analysis error' or validation error
  const displayError = validationError || (hookError ? hookError.message : null);

  // Requirement 2.4: Handle file upload with progress tracking
  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile)
    resetUpload() // Clear previous state
    setValidationError(null)

    if (!selectedFile) {
      setExtractedText("")
      return
    }

    try {
      // Use async upload hook
      await upload(selectedFile);

      // Track successful file upload start
      trackFileUpload({
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        fileName: selectedFile.name,
      })
    } catch (error) {
      // Error handled by hook state
      console.error("Upload failed", error);
    }
  }

  const handleNext = () => {
    if (currentStep < 2) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handleAnalyze = async () => {
    setIsAnalyzing(true)

    try {
      let offerId: string | undefined;

      // Branch: If we have an async offer ID (from file upload), use reanalyze
      if (asyncOffer?.id && file) {
        const { reanalyzeOffer } = await import("@/lib/api");

        const ctcValue = parseFloat(offerDetails.ctc) || 0;

        const result = await reanalyzeOffer(asyncOffer.id, {
          role: offerDetails.role,
          experience: offerDetails.experience,
          location: offerDetails.location,
          ctc: ctcValue,
          offerText: extractedText || pastedText, // Use updated text if edited
        });

        offerId = result.id;

        // Map OfferResponse to AnalyzeResponse for Context
        const mappedAnalysis: any = {
          id: result.id,
          redFlags: result.redFlagsResult || [],
          salaryComparison: result.marketComparison || { comparison: "unknown", gap: 0, percentile: 0 },
          negotiationSuggestions: [],
          analysisId: result.id
        };

        // INTERIM SOLUTION:
        // Use legacy analyze for immediate feedback, even if weuploaded file.
        // BUT we lose Negotiation ID linking.
        // UNLESS we pass the ID we already have.

        const { analyzeOffer } = await import("@/lib/api/endpoints");
        const legacyResult = await analyzeOffer({
          offerText: extractedText || pastedText,
          role: offerDetails.role,
          experience: offerDetails.experience,
          ctc: ctcValue,
          city: offerDetails.location,
        });

        // Merge ID from async upload so Negotiation works
        const finalResult = {
          ...legacyResult,
          id: asyncOffer.id, // Inject persistent ID
        };

        setContextOffer(finalResult, {
          role: offerDetails.role,
          experience: offerDetails.experience,
          city: offerDetails.location,
          ctc: ctcValue,
          offerText: extractedText || pastedText,
        })

      } else {
        // Fallback for Paste Text (Legacy)
        const { analyzeOffer } = await import("@/lib/api/endpoints")
        const ctcValue = parseFloat(offerDetails.ctc)

        const result = await analyzeOffer({
          offerText: extractedText || pastedText,
          role: offerDetails.role,
          experience: offerDetails.experience,
          ctc: ctcValue,
          city: offerDetails.location,
        })

        offerId = (result as any).id || (result as any).analysisId;

        setContextOffer(result, {
          role: offerDetails.role,
          experience: offerDetails.experience,
          city: offerDetails.location,
          ctc: ctcValue,
          offerText: extractedText || pastedText,
        })
      }

      // Requirement 2.5: Navigate to results on success
      if (offerId) {
        router.push(`/results?id=${offerId}`)
      } else {
        router.push("/results")
      }

    } catch (error) {
      // Requirement 2.6: Handle analysis errors
      // If error is from hook, it might be separate
      console.error(error);
    } finally {
      setIsAnalyzing(false)
    }
  }

  return (
    <div className="py-6 sm:py-8 md:py-12">
      <div className="mx-auto max-w-2xl px-4 sm:px-6 lg:px-8">
        {/* Back Link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>
        </motion.div>

        {/* Stepper */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Stepper steps={steps} currentStep={currentStep} className="mb-8" />
        </motion.div>

        {/* Page Title */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="text-center mb-8"
        >
          <h1 className="text-2xl font-bold sm:text-3xl">
            {currentStep === 0 && "Upload Your Offer"}
            {currentStep === 1 && "Add Details"}
            {currentStep === 2 && "Ready to Analyze"}
          </h1>
          <p className="mt-2 text-muted-foreground">
            {currentStep === 0 && "Upload a file or paste your offer letter text"}
            {currentStep === 1 && "Help us provide more accurate insights"}
            {currentStep === 2 && "Review and start the analysis"}
          </p>
        </motion.div>

        {/* Demo Banner */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mb-6 flex items-center gap-3 rounded-lg border bg-primary/5 p-4"
        >
          <Info className="h-5 w-5 text-primary shrink-0" />
          <p className="text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Demo Mode:</span> This is a demo. Upload any text to see
            sample analysis results.
          </p>
        </motion.div>

        {/* Form Steps */}
        <AnimatePresence mode="wait">
          {currentStep === 0 && (
            <motion.div
              key="step-0"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              className="space-y-6"
            >
              {/* Upload Card */}
              <FloatingCard title="Upload File">
                <UploadDropzone
                  onFileSelect={handleFileSelect}
                  onError={setValidationError}
                  disabled={isAnalyzing}
                  isUploading={isUploading}
                />

                {/* Requirement 2.4: Display upload progress */}
                {isUploading && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4"
                  >
                    <div className="flex items-center justify-between mb-2">
                      {/* Show status text */}
                      <span className="text-sm text-muted-foreground">
                        {uploadStatus === 'QUEUED' ? 'Queued...' :
                          uploadStatus === 'UPLOADING' ? 'Uploading...' :
                            uploadStatus === 'PROCESSING' ? 'Analyzing...' : 'Processing...'}
                      </span>
                      <span className="text-sm font-medium">{hookProgress}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${hookProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}

                {/* Requirement 2.6: Display upload errors with retry option */}
                {displayError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                  >
                    <p className="text-sm text-destructive">{displayError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        resetUpload()
                        setValidationError(null)
                        setFile(null)
                      }}
                    >
                      Try Again
                    </Button>
                  </motion.div>
                )}
              </FloatingCard>

              {/* Or Divider */}
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t" />
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-background px-4 text-sm text-muted-foreground">or</span>
                </div>
              </div>

              {/* Paste Text Card */}
              <FloatingCard title="Paste Text">
                <textarea
                  id="offer-text"
                  name="offer-text"
                  placeholder="Paste your offer letter content here..."
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  disabled={isUploading || isAnalyzing}
                  aria-label="Paste your offer letter text"
                  aria-describedby="paste-text-description"
                  className={cn(
                    "w-full min-h-[150px] rounded-lg border bg-transparent p-3 text-sm",
                    "placeholder:text-muted-foreground resize-none",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "disabled:cursor-not-allowed disabled:opacity-50",
                  )}
                />
                <span id="paste-text-description" className="sr-only">
                  Paste the full text of your offer letter for analysis
                </span>
              </FloatingCard>
            </motion.div>
          )}

          {currentStep === 1 && (
            <motion.div
              key="step-1"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <FloatingCard title="Offer Details">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="role">Job Role</Label>
                    <Input
                      id="role"
                      placeholder="e.g., Software Engineer"
                      value={offerDetails.role}
                      onChange={(e) => setOfferDetails({ ...offerDetails, role: e.target.value })}
                      disabled={isAnalyzing}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="experience">Experience Level</Label>
                    <Input
                      id="experience"
                      placeholder="e.g., 3 years"
                      value={offerDetails.experience}
                      onChange={(e) => setOfferDetails({ ...offerDetails, experience: e.target.value })}
                      disabled={isAnalyzing}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="location">Location</Label>
                    <Input
                      id="location"
                      placeholder="e.g., Bangalore, India"
                      value={offerDetails.location}
                      onChange={(e) => setOfferDetails({ ...offerDetails, location: e.target.value })}
                      disabled={isAnalyzing}
                      className="h-12"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ctc">Offered CTC</Label>
                    <Input
                      id="ctc"
                      placeholder="e.g., 18 LPA"
                      value={offerDetails.ctc}
                      onChange={(e) => setOfferDetails({ ...offerDetails, ctc: e.target.value })}
                      disabled={isAnalyzing}
                      className="h-12"
                    />
                  </div>
                </div>
              </FloatingCard>
            </motion.div>
          )}

          {currentStep === 2 && (
            <motion.div
              key="step-2"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <FloatingCard title="Review">
                <div className="space-y-4">
                  <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Sparkles className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">Ready to analyze</p>
                      <p className="text-xs text-muted-foreground">
                        {file ? file.name : `${pastedText.slice(0, 50)}...`}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-2 text-sm">
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Role</span>
                      <span className="font-medium">{offerDetails.role}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Experience</span>
                      <span className="font-medium">{offerDetails.experience}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b">
                      <span className="text-muted-foreground">Location</span>
                      <span className="font-medium">{offerDetails.location}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-muted-foreground">Offered CTC</span>
                      <span className="font-medium">{offerDetails.ctc}</span>
                    </div>
                  </div>
                </div>
              </FloatingCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Navigation Buttons - Requirement 8.1, 8.5: Touch-friendly mobile buttons */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="mt-6 sm:mt-8 flex flex-col sm:flex-row gap-3"
        >
          {currentStep > 0 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(currentStep - 1)}
              className="flex-1 touch-target min-h-[48px] sm:min-h-[44px]"
            >
              Back
            </Button>
          )}

          {currentStep < 2 ? (
            <Button
              onClick={handleNext}
              disabled={!canProceed || isUploading}
              className="flex-1 touch-target min-h-[48px] sm:min-h-[44px]"
            >
              Continue
            </Button>
          ) : (
            <Button
              onClick={handleAnalyze}
              disabled={isAnalyzing || isUploading}
              className="flex-1 gap-2 touch-target min-h-[48px] sm:min-h-[44px]"
            >
              {isAnalyzing ? (
                <>
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                  >
                    <Sparkles className="h-4 w-4" />
                  </motion.div>
                  Analyzing...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Analyze Offer
                </>
              )}
            </Button>
          )}
        </motion.div>
      </div>
    </div>
  )
}
