import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import PageShell from "@/components/layout/PageShell";
import LoadingState from "@/components/common/LoadingState";
import SalaryBar from "@/components/charts/SalaryBar";
import BenchmarkNotice from "@/components/salary/BenchmarkNotice";
import SalaryContributeForm from "@/components/salary/SalaryContributeForm";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { RATE_LIMITED_TEXT, isRateLimited } from "@/lib/quota";

// Backend GET /salaries/stats requires role and city to be >= 2 chars (salary.schema.ts).
// Guard here so a 1-char interim value never fires and never shows the empty-state.
const MIN_TERM_LENGTH = 2;

const SalaryExplorerPage = () => {
  const { toast } = useToast();
  // Draft = what the user is typing. Submitted = what the query reads. Keeping them
  // separate is the SAL-1 fix: typing changes only the draft, so the query key/enabled
  // no longer follow every keystroke and no longer fire a request against the 30/min limit.
  const [role, setRole] = useState("");
  const [city, setCity] = useState("");
  const [submittedRole, setSubmittedRole] = useState("");
  const [submittedCity, setSubmittedCity] = useState("");
  const [searched, setSearched] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [formMessage, setFormMessage] = useState("");

  const canSearch = role.trim().length >= MIN_TERM_LENGTH && city.trim().length >= MIN_TERM_LENGTH;

  const submit = () => {
    if (!canSearch) return;
    setSubmittedRole(role.trim());
    setSubmittedCity(city.trim());
    setSearched(true);
  };

  const { data, isLoading, error } = useQuery({
    queryKey: ["salary-stats", submittedRole, submittedCity],
    queryFn: () => api.get(ENDPOINTS.SALARIES_STATS, { params: { role: submittedRole, city: submittedCity } }).then((r) => r.data.data),
    enabled: searched && submittedRole.length >= MIN_TERM_LENGTH && submittedCity.length >= MIN_TERM_LENGTH,
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
          <Input value={role} onChange={(e) => setRole(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="Role (e.g. Software Engineer)" className="flex-1" />
          <Input value={city} onChange={(e) => setCity(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") submit(); }} placeholder="City (e.g. Bangalore)" className="flex-1" />
          <Button onClick={submit} disabled={!canSearch} className="cursor-pointer">
            <Search className="mr-2 h-4 w-4" /> Search
          </Button>
        </div>

        {isLoading && <LoadingState rows={2} />}

        {hasStats && (
          <div className="rounded-xl border border-stone-200 bg-white bg-graph p-6 space-y-4 shadow-sm">
            <SalaryBar p25={data.p25} p50={data.p50} p75={data.p75} p90={data.p90} />
            <BenchmarkNotice
              dataSource={data.dataSource}
              sampleSize={data.count}
              disclaimer={data.disclaimer}
              payBasis={data.payBasis}
              payMix={data.payMix}
              cityAdjustment={data.cityAdjustment}
            />
            {data.dataSource === "public_survey" && (
              <p className="text-sm text-foreground">
                {data.cityAdjustment
                  ? `Fewer than 10 city-level submissions so far. This is a national benchmark across all experience levels, adjusted for ${data.cityAdjustment.cityLabel} by a PLFS-based factor.`
                  : "Fewer than 10 city-level submissions so far. This is an India-wide benchmark across all cities and experience levels."}
              </p>
            )}
          </div>
        )}

        {isRateLimited(error) && (
          <p role="alert" className="text-center py-12 text-muted-foreground">{RATE_LIMITED_TEXT}</p>
        )}

        {searched && !isLoading && !hasStats && !isRateLimited(error) && (
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
                <DialogTitle>Submit salary data</DialogTitle>
                <DialogDescription>
                  Stored without your name, account or company name, and used for the market ranges shown here.
                </DialogDescription>
              </DialogHeader>
              {/* Persistent live region for validation and cooldown messages. */}
              <div role="status" aria-live="polite" className="text-sm text-foreground">{formMessage}</div>
              <SalaryContributeForm
                idPrefix="explorer"
                showPayBasis
                cancelLabel="Cancel"
                announce={setFormMessage}
                onSent={() => {
                  toast({ title: "Submitted", description: "Your data point was added." });
                  setFormMessage("");
                  setDialogOpen(false);
                }}
                onCancel={() => setDialogOpen(false)}
              />
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </PageShell>
  );
};

export default SalaryExplorerPage;
