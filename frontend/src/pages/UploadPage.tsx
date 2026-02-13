import { useState, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "@tanstack/react-query";
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

const UploadPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [experienceLevel, setExperienceLevel] = useState("");
  const [currentCtc, setCurrentCtc] = useState("");
  const [fileError, setFileError] = useState("");
  const [activeTab, setActiveTab] = useState("file");
  const [roleSearch, setRoleSearch] = useState("");
  const [citySearch, setCitySearch] = useState("");

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
      if (activeTab === "file" && file) {
        formData.append("file", file);
      } else {
        formData.append("text", pasteText);
      }
      formData.append("role", role);
      formData.append("city", city);
      formData.append("experienceLevel", experienceLevel);
      if (currentCtc) formData.append("currentCtc", currentCtc);
      return api.post(ENDPOINTS.OFFERS, formData, { headers: { "Content-Type": "multipart/form-data" } });
    },
    onSuccess: (res) => {
      const offerId = res.data.data.id;
      navigate(`/offers/${offerId}/processing`);
    },
    onError: (err: any) => {
      const code = err?.response?.status;
      if (code === 429) {
        toast({ title: "Rate limited", description: "You've used all 3 free analyses today. Create an account for unlimited.", variant: "destructive" });
      } else {
        toast({ title: "Upload failed", description: "Please check your connection and try again.", variant: "destructive" });
      }
    },
  });

  const [isExtracting, setIsExtracting] = useState(false);

  const handleExtractMetadata = async (file: File) => {
    setIsExtracting(true);
    const formData = new FormData();
    formData.append("file", file);

    try {
      const { data } = await api.post(ENDPOINTS.OFFER_EXTRACT, formData);

      const metadata = data.data;
      if (metadata.role) setRole(metadata.role);
      if (metadata.city) setCity(metadata.city);
      if (metadata.experienceLevel) setExperienceLevel(metadata.experienceLevel);
      if (metadata.currentCtc) setCurrentCtc(metadata.currentCtc.toString());

      toast({ title: "Data Extracted", description: "We've auto-filled some fields from your offer letter." });
    } catch (error) {
      console.error("Extraction failed", error);
      // Fail silently or show toast? Silent is better for UX if it's just autofill
    } finally {
      setIsExtracting(false);
    }
  };

  const validateFile = useCallback((f: File) => {
    if (!ACCEPTED_FILE_TYPES.includes(f.type)) {
      setFileError("Please upload a PDF or image (JPG, PNG, WebP)");
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
        handleExtractMetadata(f);
      }
    },
    [validateFile]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) {
      setFile(f);
      handleExtractMetadata(f);
    }
  };

  const hasContent = activeTab === "file" ? !!file : pasteText.trim().length > 20;
  const canSubmit = hasContent && role && city && experienceLevel && !submitMutation.isPending;

  return (
    <PageShell>
      <div className="container mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold mb-2 text-foreground">Upload Your Offer Letter</h1>
        <p className="text-muted-foreground mb-8">We'll analyze it and give you a score in under 30 seconds.</p>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-8">
          <TabsList className="grid w-full grid-cols-2 rounded-xl skeu-emboss">
            <TabsTrigger value="file" className="cursor-pointer rounded-lg">Upload File</TabsTrigger>
            <TabsTrigger value="text" className="cursor-pointer rounded-lg">Paste Text</TabsTrigger>
          </TabsList>

          <TabsContent value="file" className="mt-4">
            <motion.div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              onClick={() => fileInputRef.current?.click()}
              whileHover={{ scale: 1.01, borderColor: "hsl(var(--primary))" }}
              whileTap={{ scale: 0.99 }}
              className="flex flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border p-12 text-center transition-all cursor-pointer skeu-inset"
            >
              {file ? (
                <>
                  <FileText className="h-10 w-10 text-primary" />
                  <p className="font-medium text-foreground">{file.name}</p>
                  <p className="text-xs text-muted-foreground">{(file.size / 1024 / 1024).toFixed(1)} MB</p>
                  {isExtracting && <p className="text-xs text-primary animate-pulse">Extracting details...</p>}
                </>
              ) : (
                <>
                  <Upload className="h-10 w-10 text-muted-foreground" />
                  <p className="font-medium text-foreground">Drop your offer letter here</p>
                  <p className="text-xs text-muted-foreground">PDF, JPG, PNG, WebP — up to 10MB</p>
                </>
              )}
            </motion.div>
            <input ref={fileInputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={handleFileSelect} className="hidden" />
            {fileError && (
              <p className="mt-2 flex items-center gap-1 text-sm text-destructive">
                <AlertCircle className="h-4 w-4" /> {fileError}
              </p>
            )}
          </TabsContent>

          <TabsContent value="text" className="mt-4">
            <textarea
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              placeholder="Paste the text from your offer letter here…"
              className="min-h-[200px] w-full rounded-xl border border-input bg-background p-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring skeu-inset"
            />
          </TabsContent>
        </Tabs>

        {/* Context Form */}
        {hasContent && (
          <div className="space-y-4 rounded-2xl p-6 skeu-card">
            <h2 className="font-semibold text-foreground">Tell us about the role</h2>

            <div className="space-y-2">
              <Label>Role / Title *</Label>
              <Input
                value={role || roleSearch}
                onChange={(e) => { setRoleSearch(e.target.value); setRole(e.target.value); }}
                placeholder="e.g. Software Engineer"
                className="rounded-lg"
              />
              {roles?.length > 0 && roleSearch.length > 1 && (
                <div className="rounded-xl border border-border bg-popover p-1 max-h-40 overflow-auto skeu-card">
                  {roles.map((r: any) => (
                    <button key={r.id || r.name} onClick={() => { setRole(r.name); setRoleSearch(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-lg cursor-pointer">
                      {r.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>City *</Label>
              <Input
                value={city || citySearch}
                onChange={(e) => { setCitySearch(e.target.value); setCity(e.target.value); }}
                placeholder="e.g. Bangalore"
                className="rounded-lg"
              />
              {cities?.length > 0 && citySearch.length > 1 && (
                <div className="rounded-xl border border-border bg-popover p-1 max-h-40 overflow-auto skeu-card">
                  {cities.map((c: any) => (
                    <button key={c.id || c.name} onClick={() => { setCity(c.name); setCitySearch(""); }} className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent rounded-lg cursor-pointer">
                      {c.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Experience Level *</Label>
              <Select value={experienceLevel} onValueChange={setExperienceLevel}>
                <SelectTrigger className="cursor-pointer rounded-lg">
                  <SelectValue placeholder="Select level" />
                </SelectTrigger>
                <SelectContent className="rounded-xl skeu-card">
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
              <Label>Current CTC (optional)</Label>
              <Input type="number" value={currentCtc} onChange={(e) => setCurrentCtc(e.target.value)} placeholder="e.g. 1200000" className="rounded-lg" />
            </div>

            <Button
              onClick={() => submitMutation.mutate()}
              disabled={!canSubmit}
              className="w-full h-12 text-base font-semibold brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer transition-all hover:-translate-y-0.5 rounded-xl skeu-btn"
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
