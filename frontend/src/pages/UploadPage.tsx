import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import PageShell from "@/components/layout/PageShell";
import api from "@/services/api";
import { ENDPOINTS, ACCEPTED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from "@/constants/api";
import { Upload, FileText, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { motion } from "framer-motion";
import { extractTextFromFile } from "@/lib/pdf-extractor";
import { rememberGuestOffer } from "@/lib/guest-offers";
import { useQuota } from "@/hooks/use-quota";
import QuotaNotice from "@/components/common/QuotaNotice";
import {
  QUOTA_NOTICE_ID,
  RATE_LIMITED_TEXT,
  OCR_UNAVAILABLE_TEXT,
  getQuotaError,
  isOcrUnavailable,
  isRateLimited,
  isUploadBlocked,
  quotaExhaustedText,
} from "@/lib/quota";

const UploadPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const quota = useQuota();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [extractedText, setExtractedText] = useState("");
  const [pasteText, setPasteText] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [currentCtc, setCurrentCtc] = useState("");
  const [fileError, setFileError] = useState("");
  const [activeTab, setActiveTab] = useState("file");
  const [roleSearch, setRoleSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");
  const [isExtracting, setIsExtracting] = useState(false);
  const [selectedModel, setSelectedModel] = useState("gemini-flash-latest");

  const { data: roles } = useQuery({
    queryKey: ["metadata-roles", roleSearch],
    queryFn: () => api.get(ENDPOINTS.METADATA_ROLES, { params: { q: roleSearch } }).then((r) => r.data.data),
    enabled: roleSearch.length > 1,
  });

  const { data: cities } = useQuery({
    queryKey: ["metadata-cities", citySearch],
    queryFn: () => api.get(ENDPOINTS.METADATA_CITIES, { params: { q: citySearch } }).then((r) => r.data.data),
    enabled: citySearch.length > 1,
  });

  const { data: expLevels } = useQuery({
    queryKey: ["metadata-exp"],
    queryFn: () => api.get(ENDPOINTS.METADATA_EXPERIENCE_LEVELS).then((r) => r.data.data),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const formData = new FormData();

      // Always send text (either extracted from file or pasted)
      const textToSend = activeTab === "file" ? extractedText : pasteText;
      formData.append("text", textToSend);

      formData.append("role", role);
      formData.append("city", city);
      formData.append("experienceLevel", experienceLevel);
      if (currentCtc) formData.append("currentCtc", currentCtc);
      // Development only, like the picker. The backend ignores it on plans without model
      // selection anyway; production builds just stop sending it.
      if (import.meta.env.DEV) formData.append("model", selectedModel);

      console.log('[Upload] Submitting offer with FormData');
      console.log('[Upload] FormData entries:');
      for (const [key, value] of formData.entries()) {
        console.log(`  ${key}:`, typeof value === 'string' ? value.substring(0, 100) : value);
      }

      return api.post(ENDPOINTS.OFFERS, formData);
    },
    onSuccess: (res) => {
      const offerId = res.data.data.id;
      // Persist locally so the analysis survives a tab close, and so signup can
      // present it for claiming (ADR-001).
      rememberGuestOffer(offerId);
      queryClient.invalidateQueries({ queryKey: ["quota"] });
      navigate(`/offers/${offerId}/processing`);
    },
    onError: (err: unknown) => {
      // Numbers and reset time come from the 429 itself, never from a constant here.
      const quotaError = getQuotaError(err);
      if (quotaError) {
        toast({
          title: "Daily limit reached",
          description: quotaExhaustedText(quotaError, quota.data?.accountAnalysesPerDay),
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["quota"] });
      } else if (isRateLimited(err)) {
        toast({ title: "Slow down", description: RATE_LIMITED_TEXT, variant: "destructive" });
      } else {
        toast({ title: "Upload failed", description: "Please check your connection and try again.", variant: "destructive" });
      }
    },
  });

  const handleExtractAndAnalyze = async (file: File) => {
    console.log('[Upload] Starting extraction and analysis', {
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type
    });

    setIsExtracting(true);
    setFileError("");

    try {
      // Step 1: Try frontend extraction first
      console.log('[Upload] Step 1: Attempting frontend extraction');
      toast({ title: "Processing file", description: "Extracting text from your document..." });
      const extractionResult = await extractTextFromFile(file);

      console.log('[Upload] Extraction result:', extractionResult);

      let finalText = '';

      if (extractionResult.success && extractionResult.text) {
        // Success! We got text from the browser
        console.log('[Upload] ✅ Frontend extraction successful');
        finalText = extractionResult.text;
        setExtractedText(finalText);
        toast({ title: "Text extracted", description: "Successfully extracted text from your document." });
      } else if (extractionResult.needsOCR) {
        // Step 2: Fallback to backend OCR
        console.log('[Upload] Step 2: Falling back to backend OCR');
        toast({
          title: "Scanned document detected",
          description: "Using advanced OCR to extract text. This may take a moment...",
          duration: 5000
        });

        // Upload file to backend for OCR processing
        console.log('[Upload] Uploading file to backend for OCR');
        const formData = new FormData();
        formData.append("file", file);

        const { data } = await api.post(ENDPOINTS.OFFER_EXTRACT_FILE, formData);
        console.log('[Upload] Backend OCR response:', data);

        finalText = data.data.text;

        if (!finalText || finalText.length < 50) {
          console.error('[Upload] ❌ Insufficient text from OCR', { textLength: finalText?.length });
          setFileError("Could not extract enough text from file. Please try pasting the text manually.");
          setIsExtracting(false);
          return;
        }

        setExtractedText(finalText);
        console.log('[Upload] ✅ Backend OCR successful', { textLength: finalText.length });
        toast({ title: "OCR complete", description: "Successfully extracted text using OCR." });
      } else {
        console.error('[Upload] ❌ Extraction failed', extractionResult);
        setFileError(extractionResult.error || "Failed to extract text from file");
        setIsExtracting(false);
        return;
      }

      // Step 3: Extract metadata from the text
      console.log('[Upload] Step 3: Extracting metadata from text');
      console.log('[Upload] Sending request to:', ENDPOINTS.OFFER_EXTRACT);
      console.log('[Upload] Text length:', finalText.length);

      const { data } = await api.post(ENDPOINTS.OFFER_EXTRACT, { text: finalText }, {
        headers: { "Content-Type": "application/json" }
      });

      console.log('[Upload] ✅ Metadata extraction response received');
      console.log('[Upload] Full response:', JSON.stringify(data, null, 2));
      console.log('[Upload] Response data field:', data.data);
      console.log('[Upload] Response data type:', typeof data.data);
      console.log('[Upload] Response data keys:', data.data ? Object.keys(data.data) : 'null');

      const metadata = data.data;
      console.log('[Upload] Metadata object:', metadata);

      if (metadata && metadata.role) {
        console.log('[Upload] ✅ Setting role:', metadata.role);
        setRole(metadata.role);
      } else {
        console.log('[Upload] ⚠️ No role found in metadata');
      }

      if (metadata && metadata.city) {
        console.log('[Upload] ✅ Setting city:', metadata.city);
        setCity(metadata.city);
      } else {
        console.log('[Upload] ⚠️ No city found in metadata');
      }

      if (metadata && metadata.experienceLevel) {
        console.log('[Upload] ✅ Setting experience level:', metadata.experienceLevel);
        setExperienceLevel(metadata.experienceLevel);
      } else {
        console.log('[Upload] ⚠️ No experienceLevel found in metadata');
      }

      if (metadata && metadata.currentCtc) {
        console.log('[Upload] ✅ Setting current CTC:', metadata.currentCtc);
        setCurrentCtc(metadata.currentCtc.toString());
      } else {
        console.log('[Upload] ⚠️ No currentCtc found in metadata');
      }

      console.log('[Upload] ✅ Complete! Metadata extracted successfully');
      console.log('[Upload] Final state - role:', role, 'city:', city, 'experienceLevel:', experienceLevel, 'currentCtc:', currentCtc);
      toast({ title: "Data extracted", description: "We've auto-filled some fields from your offer letter." });
    } catch (error: any) {
      // Autofill's daily cap. The text is already extracted, so this is not a file error:
      // the user fills the fields in by hand and can still analyse.
      const quotaError = getQuotaError(error);
      if (quotaError) {
        toast({ title: "Autofill limit reached", description: quotaExhaustedText(quotaError) });
        return;
      }

      // This deployment has no real OCR provider, so a scanned document or image cannot be
      // read here. Not a file problem the user can fix by retrying: tell them to paste the
      // text or upload a text-layer PDF, in the inline notice they already see for file errors.
      if (isOcrUnavailable(error)) {
        setFileError(OCR_UNAVAILABLE_TEXT);
        toast({
          title: "Image uploads unavailable",
          description: OCR_UNAVAILABLE_TEXT,
          variant: "destructive",
        });
        return;
      }

      console.error('[Upload] ❌ Extraction failed with error:', error);
      console.error('[Upload] Error details:', {
        message: error.message,
        response: error?.response?.data,
        status: error?.response?.status
      });

      const errorMsg = error?.response?.data?.error?.message || error.message || "Failed to process file";
      setFileError(errorMsg);
      toast({
        title: "Extraction failed",
        description: "Please try pasting the text manually instead.",
        variant: "destructive"
      });
    } finally {
      setIsExtracting(false);
      console.log('[Upload] Extraction process complete');
    }
  };

  const validateFile = useCallback((f: File) => {
    if (!ACCEPTED_FILE_TYPES.includes(f.type)) {
      setFileError("Please upload a PDF or image (JPG, PNG)");
      return false;
    }
    if (f.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File must be under ${MAX_FILE_SIZE_MB}MB`);
      return false;
    }
    setFileError("");
    return true;
  }, []);

  const handleFileDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      const f = e.dataTransfer.files[0];
      if (f && validateFile(f)) {
        setFile(f);
        handleExtractAndAnalyze(f);
      }
    },
    [validateFile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) {
      setFile(f);
      handleExtractAndAnalyze(f);
    }
  };

  const hasContent = activeTab === "file" ? !!extractedText : pasteText.trim().length > 20;
  const blocked = isUploadBlocked(quota.data);
  const canSubmit = hasContent && role && city && experienceLevel && !submitMutation.isPending && !blocked;

  return (
    <PageShell>
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <p className="font-mono text-xs uppercase tracking-widest text-primary">01 — upload</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight text-foreground">Upload your offer letter</h1>
        <p className="mt-2 text-muted-foreground">
          We read it line by line and score it. <span className="font-mono text-xs text-muted-foreground">// usually 15–30s</span>
        </p>

        <div className="mt-8">
          <QuotaNotice quota={quota.data} />
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 rounded-md">
            <TabsTrigger value="file" className="cursor-pointer rounded-sm">Upload File</TabsTrigger>
            <TabsTrigger value="text" className="cursor-pointer rounded-sm">Paste Text</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4">
            <motion.div
              role="button"
              tabIndex={0}
              aria-label="Drop your offer letter here, or click to browse"
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              whileTap={{ scale: 0.99 }}
              className="flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-stone-300 bg-white bg-ruled p-12 text-center shadow-sm transition-colors hover:border-cyan-700 hover:in-focus focus-visible:border-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" aria-hidden="true" />
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  {isExtracting && <p className="font-mono text-xs text-primary animate-pulse">// reading your offer…</p>}
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-stone-500" aria-hidden="true" />
                  <p className="font-medium text-foreground">Drop your offer letter here</p>
                  <p className="font-mono text-xs text-muted-foreground">// pdf, image, or paste the text — up to 10 MB</p>
                </>
              )}
            </motion.div>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={handleFileSelect} className="hidden" />
            {fileError && (
              <p role="alert" className="mt-2 flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" aria-hidden="true" /> {fileError}
              </p>
            )}
          </TabsContent>

          <TabsContent value="text" className="mt-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the text from your offer letter here…"
              className="min-h-[200px] w-full rounded-md border border-stone-300 bg-white p-4 text-base text-stone-900 placeholder:text-stone-500 focus-visible:border-cyan-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700"
            />
          </TabsContent>
        </Tabs>

        {/* Context Form */}
        {hasContent && (
          <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-foreground">Tell us about the role</h2>

            <div className="space-y-2">
              <Label htmlFor="upload-role">Role / Title *</Label>
              <Input
                id="upload-role"
                value={role || roleSearch}
                onChange={(e) => { setRoleSearch(e.target.value); setRole(e.target.value); }}
                placeholder="e.g. Software Engineer"
                className="rounded-lg"
              />
              {roles?.length > 0 && roleSearch.length > 1 && (
                <div className="rounded-xl border border-stone-200 bg-popover p-1 max-h-40 overflow-auto shadow-sm">
                  {roles.map((r: any) => (
                    <button key={r.id || r.name} onClick={() => { setRole(r.name); setRoleSearch(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-lg cursor-pointer">
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-city">City *</Label>
              <Input
                id="upload-city"
                value={city || citySearch}
                onChange={(e) => { setCitySearch(e.target.value); setCity(e.target.value); }}
                placeholder="e.g. Bangalore"
                className="rounded-lg"
              />
              {cities?.length > 0 && citySearch.length > 1 && (
                <div className="rounded-xl border border-stone-200 bg-popover p-1 max-h-40 overflow-auto shadow-sm">
                  {cities.map((c: any) => (
                    <button key={c.id || c.name} onClick={() => { setCity(c.name); setCitySearch(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-lg cursor-pointer">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-experience-level">Experience Level *</Label>
              <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                <SelectTrigger id="upload-experience-level" className="cursor-pointer rounded-lg">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent className="rounded-xl">
                  {(expLevels || []).map((l: any) => {
                    const value = typeof l === 'string' ? l : l.name || l.label || l.id;
                    return (
                      <SelectItem key={value} value={value} className="cursor-pointer rounded-lg">
                        {value}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-current-ctc">Current CTC (optional)</Label>
              <Input id="upload-current-ctc" type="number" value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)} placeholder="e.g. 1200000" className="rounded-lg" />
            </div>

            {import.meta.env.DEV && (
            <div className="space-y-2">
              <Label>AI Model (Development Only)</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger className="cursor-pointer rounded-lg">
                  <SelectValue placeholder="Select model" />
                </SelectTrigger>
                <SelectContent className="rounded-xl max-h-60 overflow-auto">
                  <SelectItem value="gemini-2.5-flash" className="cursor-pointer rounded-lg">gemini-2.5-flash (Fast, Thinking)</SelectItem>
                  <SelectItem value="gemini-2.5-pro" className="cursor-pointer rounded-lg">gemini-2.5-pro (Most Capable)</SelectItem>
                  <SelectItem value="gemini-2.0-flash" className="cursor-pointer rounded-lg">gemini-2.0-flash</SelectItem>
                  <SelectItem value="gemini-flash-latest" className="cursor-pointer rounded-lg">gemini-flash-latest (Default)</SelectItem>
                  <SelectItem value="gemini-2.5-flash-lite" className="cursor-pointer rounded-lg">gemini-2.5-flash-lite (Lightweight)</SelectItem>
                  <SelectItem value="gemini-2.0-flash-lite" className="cursor-pointer rounded-lg">gemini-2.0-flash-lite</SelectItem>
                  <SelectItem value="gemini-flash-lite-latest" className="cursor-pointer rounded-lg">gemini-flash-lite-latest</SelectItem>
                  <SelectItem value="gemini-pro-latest" className="cursor-pointer rounded-lg">gemini-pro-latest</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Model auto-switches on rate limit</p>
            </div>
            )}

            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit}
              aria-describedby={blocked ? QUOTA_NOTICE_ID : undefined}
              className="w-full h-12 rounded-md bg-cyan-700 text-base font-medium text-white hover:bg-cyan-800 cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-cyan-700 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              {submitMutation.isPending ? "Uploading…" : "Analyze My Offer"}
            </Button>
          </div>
        )}
      </div>
    </PageShell>
  );
};

export default UploadPage;
