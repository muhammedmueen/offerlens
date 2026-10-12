import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import SalaryBar from "@/components/charts/SalaryBar";
import BenchmarkNotice from "@/components/salary/BenchmarkNotice";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// Both mirror NOT NULL enum columns on salary_submissions. Free text here becomes a
// constraint violation on insert.
const COMPANY_TYPES = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service / Consulting" },
  { value: "startup", label: "Startup" },
  { value: "mnc", label: "MNC" },
  { value: "other", label: "Other" },
] as const;

const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

const SalaryExplorerPage = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [searched, setSearched] = useState(false);

  // Submit form state
  const [subRole, setSubRole] = useState("");
  const [subCity, setSubCity] = useState("");
  const [subExp, setSubExp] = useState("");
  const [subCtc, setSubCtc] = useState("");
  const [subSize, setSubSize] = useState("");
  const [subType, setSubType] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["salary-stats", role, city],
    queryFn: () => api.get(ENDPOINTS.SALARIES_STATS, { params: { role, city } }).then((r) => r.data.data),
    enabled: searched && !!role && !!city,
  });

  const submitMutation = useMutation({
    // Field names must match the server: `ctc` (not annualCtc), and `companyType` is
    // NOT NULL. companySize is a fixed set of buckets, not free text.
    mutationFn: () => api.post(ENDPOINTS.SALARIES, {
      role: subRole,
      city: subCity,
      experienceYears: Number(subExp),
      ctc: Number(subCtc),
      companyType: subType,
      companySize: subSize || undefined,
    }),
    onSuccess: () => { toast({ title: "Submitted!", description: "Your anonymous salary data was added." }); setDialogOpen(false); queryClient.invalidateQueries({ queryKey: ["salary-stats"] }); },
    onError: (err: any) => {
      if (err.response?.status === 429) toast({ title: "Rate limited", description: "Too many submissions. Please try again later.", variant: "destructive" });
      else toast({ title: "Error", description: "Submission failed.", variant: "destructive" });
    },
  });

  // Stats are only usable once enough submissions exist. Below the threshold the API
  // returns { count, message, data: null } — truthy, which previously rendered a chart
  // with undefined values.
  const hasStats = typeof data?.p50 === "number";

  return (
    <PageShell>
      <div className="container mx-auto max-w-3xl px-4 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Salary Explorer</h1>

        <div className="flex flex-col gap-4 sm:flex-row">
          <Input value={role} onChange={(e) => setRole(e.target.value)} placeholder="Role (e.g. Software Engineer)" className="flex-1" />
          <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City (e.g. Bangalore)" className="flex-1" />
          <Button onClick={() => { setSearched(true); refetch(); }} disabled={!role || !city} className="brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>
        </div>

        {isLoading && <LoadingState rows={2} />}

        {hasStats && (
          <div className="rounded-xl border border-border bg-card p-6 space-y-4">
            <SalaryBar p25={data.p25} p50={data.p50} p75={data.p75} p90={data.p90} />
            <BenchmarkNotice
              dataSource={data.dataSource}
              sampleSize={data.count}
              disclaimer={data.dataSource === "public_survey" ? "Modelled from public surveys, not offers in your city." : undefined}
            />
            {data.dataSource === "public_survey" && (
              <p className="text-sm text-foreground">
                Fewer than 10 city-level submissions so far. This is an India-wide benchmark across all cities and experience levels.
              </p>
            )}
          </div>
        )}

        {searched && !isLoading && !hasStats && (
          <div className="text-center py-12">
            <p className="text-muted-foreground">
              {data?.message ?? "No data for this combination yet."}
            </p>
            {/* 10 = backend MIN_SAMPLE_SIZE. Above it the count is pre-outlier-rejection, so "a few more" would mislead. */}
            {typeof data?.count === "number" && data.count > 0 && data.count < 10 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {data.count} submission{data.count === 1 ? "" : "s"} so far — a few more and we can show a range.
              </p>
            )}
            <Button variant="link" onClick={() => setDialogOpen(true)} className="text-primary cursor-pointer">
              Contribute yours
            </Button>
          </div>
        )}

        <div className="text-center">
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" className="cursor-pointer">Submit Your Salary</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Submit Salary (Anonymous)</DialogTitle>
                <DialogDescription>
                  Your submission is anonymous and feeds the market ranges shown here.
                </DialogDescription>
              </DialogHeader>
              <form onSubmit={(e) => { e.preventDefault(); submitMutation.mutate(); }} className="space-y-4">
                <div className="space-y-2"><Label>Role</Label><Input value={subRole} onChange={(e) => setSubRole(e.target.value)} required /></div>
                <div className="space-y-2"><Label>City</Label><Input value={subCity} onChange={(e) => setSubCity(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Experience (years)</Label><Input type="number" value={subExp} onChange={(e) => setSubExp(e.target.value)} required /></div>
                <div className="space-y-2"><Label>Annual CTC (₹)</Label><Input type="number" value={subCtc} onChange={(e) => setSubCtc(e.target.value)} required /></div>
                <div className="space-y-2">
                  <Label htmlFor="company-type">Company Type</Label>
                  <Select value={subType} onValueChange={setSubType} required>
                    <SelectTrigger id="company-type" className="cursor-pointer">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_TYPES.map((t) => (
                        <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company-size">Company Size (optional)</Label>
                  <Select value={subSize} onValueChange={setSubSize}>
                    <SelectTrigger id="company-size" className="cursor-pointer">
                      <SelectValue placeholder="Select size" />
                    </SelectTrigger>
                    <SelectContent>
                      {COMPANY_SIZES.map((s) => (
                        <SelectItem key={s} value={s}>{s} employees</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <p className="text-xs text-muted-foreground">🔒 Your submission is fully anonymous</p>
                <Button type="submit" disabled={submitMutation.isPending || !subType} className="w-full brand-gradient text-primary-foreground hover:opacity-90 cursor-pointer rounded-xl skeu-btn">

                  {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null} Submit
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PageShell>
  );
};

export default SalaryExplorerPage;
