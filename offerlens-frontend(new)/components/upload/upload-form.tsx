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

const steps = [{ label: "Upload" }, { label: "Details" }, { label: "Analyze" }]

export function UploadForm() {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(0)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)

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

  const hasContent = file || pastedText.trim().length > 0
  const hasDetails = offerDetails.role && offerDetails.experience && offerDetails.location && offerDetails.ctc

  const canProceed = currentStep === 0 ? hasContent : currentStep === 1 ? hasDetails : true

  // Requirement 2.4: Handle file upload with progress tracking
  const handleFileSelect = async (selectedFile: File | null) => {
    setFile(selectedFile)
    setUploadError(null)
    
    if (!selectedFile) {
      setExtractedText("")
      setUploadProgress(0)
      return
    }

    // Start upload process
    setIsUploading(true)
    setUploadProgress(0)

    try {
      const { uploadOfferLetter } = await import("@/lib/services/upload")
      
      // Requirement 2.4: Display upload progress
      const response = await uploadOfferLetter(selectedFile, {
        onProgress: (progress) => {
          setUploadProgress(progress.percentage)
        },
      })

      // Store extracted text
      setExtractedText(response.text)
      setUploadProgress(100)

      // Track successful file upload
      trackFileUpload({
        fileType: selectedFile.type,
        fileSize: selectedFile.size,
        fileName: selectedFile.name,
      })
    } catch (error) {
      // Requirement 2.6: Display error message and allow retry
      const errorMessage = error instanceof Error ? error.message : "Failed to upload file"
      setUploadError(errorMessage)
      setFile(null)
      setExtractedText("")
    } finally {
      setIsUploading(false)
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
      // Use extracted text from file or pasted text
      const offerText = extractedText || pastedText

      // Import API function dynamically
      const { analyzeOffer } = await import("@/lib/api/endpoints")
      
      // Call analysis API
      const result = await analyzeOffer({
        offerText,
        role: offerDetails.role,
        experience: offerDetails.experience,
        ctc: parseFloat(offerDetails.ctc),
        city: offerDetails.location,
      })

      // Store result in context (will be implemented)
      // For now, navigate to results with data in state
      // Requirement 2.5: Navigate to results on success
      router.push("/results")
    } catch (error) {
      // Requirement 2.6: Handle analysis errors
      const errorMessage = error instanceof Error ? error.message : "Failed to analyze offer"
      setUploadError(errorMessage)
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
                  onError={setUploadError}
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
                      <span className="text-sm text-muted-foreground">Uploading...</span>
                      <span className="text-sm font-medium">{uploadProgress}%</span>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <motion.div
                        className="h-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${uploadProgress}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                  </motion.div>
                )}

                {/* Requirement 2.6: Display upload errors with retry option */}
                {uploadError && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
                  >
                    <p className="text-sm text-destructive">{uploadError}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={() => {
                        setUploadError(null)
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
