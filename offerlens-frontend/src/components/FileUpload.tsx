import { useCallback, useState } from "react";
import { Upload, FileText, X, Image, Loader2, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { extractText } from "@/lib/api";

/**
 * FileUpload Component
 * Requirements: 7.1, 7.2
 * 
 * Handles file uploads and text extraction via backend API
 * - Supports PDF, images (JPG, PNG), and text files
 * - Calls backend OCR service for PDF and image extraction
 * - Displays extraction progress and confidence
 */

interface FileUploadProps {
  onTextExtracted: (text: string, fileName: string) => void;
  onError: (error: string) => void;
  className?: string;
}

export function FileUpload({ onTextExtracted, onError, className }: FileUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUploaded, setFileUploaded] = useState(false);
  const [extractionConfidence, setExtractionConfidence] = useState<number | null>(null);

  const handleFile = useCallback(
    async (file: File) => {
      const validTypes = [
        "application/pdf",
        "image/jpeg",
        "image/jpg",
        "image/png",
        "text/plain",
      ];

      if (!validTypes.includes(file.type)) {
        onError("Please upload a PDF, JPG, PNG, or TXT file");
        return;
      }

      // Check file size (max 10MB)
      const maxSize = 10 * 1024 * 1024; // 10MB in bytes
      if (file.size > maxSize) {
        onError("File size exceeds 10MB limit. Please upload a smaller file.");
        return;
      }

      setIsProcessing(true);
      setFileName(file.name);
      setExtractionConfidence(null);

      try {
        // For text files, read directly
        if (file.type === "text/plain") {
          const text = await file.text();
          if (text.length > 0) {
            onTextExtracted(text, file.name);
            setFileUploaded(true);
            setExtractionConfidence(1.0); // 100% confidence for text files
          } else {
            onError("The file appears to be empty.");
          }
        } else {
          // For PDF and images, call backend API
          const result = await extractText(file);
          
          if (result.success && result.text) {
            onTextExtracted(result.text, file.name);
            setFileUploaded(true);
            setExtractionConfidence(result.confidence);
            
            // Show warning if confidence is low
            if (result.confidence < 0.7) {
              onError(
                `Text extracted with ${Math.round(result.confidence * 100)}% confidence. Please review and edit the text below if needed.`
              );
            }
          } else {
            onError(
              result.error || "Failed to extract text from file. Please try pasting the text manually."
            );
          }
        }
      } catch (error: any) {
        console.error("Error processing file:", error);
        onError(
          error.message || "Error processing file. Please try pasting the text manually."
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [onTextExtracted, onError]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragging(false);

      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const clearFile = useCallback(() => {
    setFileName(null);
    setFileUploaded(false);
  }, []);

  return (
    <div className={cn("w-full", className)}>
      {fileName ? (
        <div className="space-y-3">
          <div className="flex items-center justify-between p-4 rounded-xl bg-primary/5 border border-primary/20">
            <div className="flex items-center gap-3">
              <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
                <FileText className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="font-medium text-foreground">{fileName}</p>
                <p className="text-sm text-muted-foreground">
                  {isProcessing ? "Processing..." : "File selected"}
                </p>
              </div>
            </div>
            <button
              onClick={clearFile}
              className="p-2 rounded-lg hover:bg-muted transition-colors"
              type="button"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
          {fileUploaded && extractionConfidence !== null && extractionConfidence < 1.0 && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-info/10 text-info text-sm">
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
              <p>
                Text extracted with {Math.round(extractionConfidence * 100)}% confidence. 
                Please review the text below and edit if needed.
              </p>
            </div>
          )}
        </div>
      ) : (
        <label
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          className={cn(
            "upload-zone flex flex-col items-center justify-center cursor-pointer min-h-[180px]",
            isDragging && "active",
            isProcessing && "pointer-events-none opacity-60"
          )}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.txt"
            onChange={handleInputChange}
            className="hidden"
            disabled={isProcessing}
          />

          {isProcessing ? (
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-10 h-10 text-primary animate-spin" />
              <p className="text-muted-foreground">Processing...</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4 transition-transform hover:scale-105">
                <Upload className="w-7 h-7 text-primary" />
              </div>
              <p className="text-foreground font-medium mb-1">
                Drop your offer letter here
              </p>
              <p className="text-sm text-muted-foreground mb-3">
                or click to browse
              </p>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <FileText className="w-3.5 h-3.5" />
                <span>PDF, TXT</span>
                <span className="text-border">•</span>
                <Image className="w-3.5 h-3.5" />
                <span>JPG, PNG</span>
              </div>
            </>
          )}
        </label>
      )}
    </div>
  );
}
