"use client"

import type React from "react"

import { useCallback, useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Upload, File, X, CheckCircle, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { validateFile, getFileTypeDisplay, formatFileSize } from "@/lib/services/upload"

interface UploadDropzoneProps {
  onFileSelect: (file: File | null) => void
  onError?: (error: string) => void
  accept?: string
  className?: string
  disabled?: boolean
  isUploading?: boolean
}

export function UploadDropzone({ onFileSelect, onError, accept = ".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.webp", className, disabled = false, isUploading = false }: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  
  // Requirement 7.5: Disable UI during operations
  const isDisabled = disabled || isUploading

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    if (!isDisabled) {
      setIsDragging(true)
    }
  }, [isDisabled])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)

      if (isDisabled) return

      const droppedFile = e.dataTransfer.files[0]
      if (droppedFile) {
        // Requirement 2.2, 2.3: Validate file before accepting
        const validation = validateFile(droppedFile)
        if (!validation.valid) {
          setError(validation.error || 'Invalid file')
          setFile(null)
          onFileSelect(null)
          if (onError) {
            onError(validation.error || 'Invalid file')
          }
          return
        }

        setError(null)
        setFile(droppedFile)
        onFileSelect(droppedFile)
      }
    },
    [onFileSelect, onError, isDisabled],
  )

  const handleFileInput = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (isDisabled) return
      
      const selectedFile = e.target.files?.[0]
      if (selectedFile) {
        // Requirement 2.2, 2.3: Validate file before accepting
        const validation = validateFile(selectedFile)
        if (!validation.valid) {
          setError(validation.error || 'Invalid file')
          setFile(null)
          onFileSelect(null)
          if (onError) {
            onError(validation.error || 'Invalid file')
          }
          return
        }

        setError(null)
        setFile(selectedFile)
        onFileSelect(selectedFile)
      }
    },
    [onFileSelect, onError, isDisabled],
  )

  const removeFile = useCallback(() => {
    setFile(null)
    setError(null)
    onFileSelect(null)
  }, [onFileSelect])

  return (
    <div className={className}>
      <AnimatePresence mode="wait">
        {error ? (
          <motion.div
            key="error"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-start gap-3 rounded-xl border border-destructive/50 bg-destructive/10 p-4"
          >
            <AlertCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="font-medium text-sm text-destructive mb-1">Upload Error</p>
              <p className="text-xs text-destructive/80">{error}</p>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 hover:bg-destructive/20"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        ) : file ? (
          <motion.div
            key="file"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="flex items-center gap-3 rounded-xl border bg-secondary/50 p-4"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
              <File className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="truncate font-medium text-sm">{file.name}</p>
              <p className="text-xs text-muted-foreground">
                {getFileTypeDisplay(file)} • {formatFileSize(file.size)}
              </p>
            </div>
            <CheckCircle className="h-5 w-5 text-green-500 shrink-0" />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={removeFile}
              aria-label="Remove file"
            >
              <X className="h-4 w-4" />
            </Button>
          </motion.div>
        ) : (
          <motion.label
            key="dropzone"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 transition-colors",
              isDisabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              isDragging && !isDisabled ? "border-primary bg-primary/5" : "border-muted hover:border-primary/50 hover:bg-secondary/50",
            )}
            role="button"
            aria-label="Upload file dropzone. Click to browse or drag and drop a file"
            tabIndex={isDisabled ? -1 : 0}
            onKeyDown={(e) => {
              if ((e.key === 'Enter' || e.key === ' ') && !isDisabled) {
                e.preventDefault()
                e.currentTarget.querySelector('input')?.click()
              }
            }}
          >
            <motion.div animate={{ y: isDragging ? -5 : 0 }} transition={{ type: "spring", stiffness: 300 }}>
              <Upload
                className={cn(
                  "h-10 w-10 mb-4 transition-colors",
                  isDragging ? "text-primary" : "text-muted-foreground",
                )}
                aria-hidden="true"
              />
            </motion.div>
            <p className="font-medium text-sm mb-1">
              {isDragging ? "Drop your file here" : "Drop your offer letter here"}
            </p>
            <p className="text-xs text-muted-foreground mb-2">
              {isUploading ? "Uploading..." : "or click to browse"}
            </p>
            <p className="text-xs text-muted-foreground">PDF, Image, DOC, or TXT (max 10MB)</p>
            <input 
              type="file" 
              className="hidden" 
              accept={accept} 
              onChange={handleFileInput}
              disabled={isDisabled}
              aria-label="File upload input"
            />
          </motion.label>
        )}
      </AnimatePresence>
    </div>
  )
}
