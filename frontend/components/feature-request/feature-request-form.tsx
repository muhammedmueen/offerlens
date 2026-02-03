"use client"

import type React from "react"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowLeft, Lightbulb, Send, CheckCircle2, AlertCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { FloatingCard } from "@/components/ui/floating-card"
import { IconContainer } from "@/components/ui/icon-container"
import { cn } from "@/lib/utils"
import { createFeatureRequest } from "@/lib/api/endpoints"
import type { ApiError } from "@/lib/api/client"
import { useToast } from "@/components/ui/use-toast"
import { trackFeatureRequest } from "@/lib/analytics"

const categories = [
  { value: "feature", label: "New Feature" },
  { value: "role", label: "New Role" },
  { value: "issue", label: "Bug Report" },
]

interface FormErrors {
  title?: string
  description?: string
  email?: string
}

export function FeatureRequestForm() {
  const router = useRouter()
  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showSuccess, setShowSuccess] = useState(false)
  const [errors, setErrors] = useState<FormErrors>({})
  const [apiError, setApiError] = useState<string | null>(null)
  
  // Requirement 13.5: Preserve form data on error
  const [formData, setFormData] = useState({
    type: "feature" as "feature" | "role" | "issue",
    title: "",
    description: "",
    email: "",
  })

  // Requirement 13.2: Validate all required fields before submission
  const validateForm = (): boolean => {
    const newErrors: FormErrors = {}

    // Title validation
    if (!formData.title.trim()) {
      newErrors.title = "Title is required"
    } else if (formData.title.trim().length < 5) {
      newErrors.title = "Title must be at least 5 characters"
    } else if (formData.title.trim().length > 200) {
      newErrors.title = "Title must be less than 200 characters"
    }

    // Description validation
    if (!formData.description.trim()) {
      newErrors.description = "Description is required"
    } else if (formData.description.trim().length < 20) {
      newErrors.description = "Description must be at least 20 characters"
    } else if (formData.description.trim().length > 2000) {
      newErrors.description = "Description must be less than 2000 characters"
    }

    // Email validation (optional but must be valid if provided)
    if (formData.email.trim()) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
      if (!emailRegex.test(formData.email.trim())) {
        newErrors.email = "Please enter a valid email address"
      }
    }

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }

  // Requirement 13.3: Send data to backend API
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    // Clear previous errors
    setApiError(null)
    
    // Requirement 13.2: Validate before submission
    if (!validateForm()) {
      return
    }

    setIsSubmitting(true)

    try {
      // Requirement 13.3: Call the API
      const requestData = {
        type: formData.type,
        title: formData.title.trim(),
        description: formData.description.trim(),
        userEmail: formData.email.trim() || undefined,
      }

      await createFeatureRequest(requestData)

      // Requirement 17.3: Track feature request submission
      trackFeatureRequest({
        type: formData.type,
        titleLength: formData.title.trim().length,
        descriptionLength: formData.description.trim().length,
        hasEmail: !!formData.email.trim(),
      })

      // Requirement 13.4: Display success message and clear form
      setShowSuccess(true)
      
      // Show success toast
      toast({
        title: "Request Submitted!",
        description: "Thank you for your feedback. We'll review your request soon.",
        variant: "default",
      })

      // Clear form data
      setFormData({
        type: "feature",
        title: "",
        description: "",
        email: "",
      })
      setErrors({})

      // Redirect to forum after a short delay
      setTimeout(() => {
        router.push("/forum")
      }, 2000)

    } catch (error) {
      // Requirement 13.5: Display error message and preserve form data
      const apiErr = error as ApiError
      const errorMessage = apiErr.message || "Failed to submit request. Please try again."
      
      setApiError(errorMessage)
      
      // Show error toast
      toast({
        title: "Submission Failed",
        description: errorMessage,
        variant: "destructive",
      })
      
      // Form data is preserved automatically by not clearing state
    } finally {
      setIsSubmitting(false)
    }
  }

  const isValid = formData.title.trim() && formData.description.trim()

  return (
    <div className="py-8 sm:py-12">
      <div className="mx-auto max-w-xl px-4 sm:px-6">
        {/* Back Link */}
        <motion.div initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="mb-6">
          <Link
            href="/forum"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Forum
          </Link>
        </motion.div>

        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="text-center mb-8"
        >
          <IconContainer icon={Lightbulb} variant="primary" size="xl" className="mx-auto mb-4" />
          <h1 className="text-2xl font-bold sm:text-3xl">Submit a Feature Request</h1>
          <p className="mt-2 text-muted-foreground">Help us improve OfferLens with your ideas</p>
        </motion.div>

        {/* Success Message - Requirement 13.4 */}
        <AnimatePresence>
          {showSuccess && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <FloatingCard className="border-green-500/50 bg-green-500/10">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-green-700 dark:text-green-400">Request Submitted Successfully!</h3>
                    <p className="text-sm text-green-600 dark:text-green-500 mt-1">
                      Thank you for your feedback. We&apos;ll review your request and get back to you soon.
                    </p>
                  </div>
                </div>
              </FloatingCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error Message - Requirement 13.5 */}
        <AnimatePresence>
          {apiError && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="mb-6"
            >
              <FloatingCard className="border-red-500/50 bg-red-500/10">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <h3 className="font-semibold text-red-700 dark:text-red-400">Submission Failed</h3>
                    <p className="text-sm text-red-600 dark:text-red-500 mt-1">{apiError}</p>
                    <p className="text-xs text-red-500 dark:text-red-600 mt-2">
                      Your form data has been preserved. Please try again.
                    </p>
                  </div>
                </div>
              </FloatingCard>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Form Card */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <FloatingCard>
            <form onSubmit={handleSubmit} className="space-y-6" noValidate>
              {/* Type Selector */}
              <div className="space-y-2">
                <Label>Request Type</Label>
                <div className="grid grid-cols-3 gap-2">
                  {categories.map((cat) => (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setFormData({ ...formData, type: cat.value as "feature" | "role" | "issue" })}
                      disabled={isSubmitting}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                        "disabled:opacity-50 disabled:cursor-not-allowed",
                        formData.type === cat.value
                          ? "border-primary bg-primary text-primary-foreground"
                          : "hover:border-primary/50 hover:bg-secondary",
                      )}
                    >
                      {cat.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title - Requirement 13.2: Validation */}
              <div className="space-y-2">
                <Label htmlFor="title">
                  Title <span className="text-red-500">*</span>
                </Label>
                <Input
                  id="title"
                  placeholder="Give your request a clear title"
                  value={formData.title}
                  onChange={(e) => {
                    setFormData({ ...formData, title: e.target.value })
                    // Clear error when user starts typing
                    if (errors.title) {
                      setErrors({ ...errors, title: undefined })
                    }
                  }}
                  className={cn("h-12", errors.title && "border-red-500 focus-visible:ring-red-500")}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.title}
                  aria-describedby={errors.title ? "title-error" : undefined}
                />
                {errors.title && (
                  <p id="title-error" className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.title}
                  </p>
                )}
              </div>

              {/* Description - Requirement 13.2: Validation */}
              <div className="space-y-2">
                <Label htmlFor="description">
                  Description <span className="text-red-500">*</span>
                </Label>
                <textarea
                  id="description"
                  placeholder="Describe your feature request in detail. What problem does it solve? How would it work?"
                  value={formData.description}
                  onChange={(e) => {
                    setFormData({ ...formData, description: e.target.value })
                    // Clear error when user starts typing
                    if (errors.description) {
                      setErrors({ ...errors, description: undefined })
                    }
                  }}
                  className={cn(
                    "w-full min-h-[120px] rounded-lg border bg-transparent p-3 text-sm",
                    "placeholder:text-muted-foreground resize-none",
                    "focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
                    "disabled:opacity-50 disabled:cursor-not-allowed",
                    errors.description && "border-red-500 focus:ring-red-500",
                  )}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.description}
                  aria-describedby={errors.description ? "description-error" : undefined}
                />
                {errors.description && (
                  <p id="description-error" className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.description}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  {formData.description.length}/2000 characters
                </p>
              </div>

              {/* Email (Optional) - Requirement 13.2: Validation */}
              <div className="space-y-2">
                <Label htmlFor="email">
                  Email <span className="text-muted-foreground">(optional)</span>
                </Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="your@email.com"
                  value={formData.email}
                  onChange={(e) => {
                    setFormData({ ...formData, email: e.target.value })
                    // Clear error when user starts typing
                    if (errors.email) {
                      setErrors({ ...errors, email: undefined })
                    }
                  }}
                  className={cn("h-12", errors.email && "border-red-500 focus-visible:ring-red-500")}
                  disabled={isSubmitting}
                  aria-invalid={!!errors.email}
                  aria-describedby={errors.email ? "email-error" : undefined}
                />
                {errors.email ? (
                  <p id="email-error" className="text-sm text-red-500 flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {errors.email}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    We&apos;ll notify you when your request is reviewed
                  </p>
                )}
              </div>

              {/* Submit Button - Requirement 7.5: Disable during operation */}
              <Button 
                type="submit" 
                disabled={!isValid || isSubmitting} 
                className="w-full gap-2"
              >
                {isSubmitting ? (
                  <>
                    <motion.div
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
                    >
                      <Send className="h-4 w-4" />
                    </motion.div>
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Submit Request
                  </>
                )}
              </Button>
            </form>
          </FloatingCard>
        </motion.div>
      </div>
    </div>
  )
}
