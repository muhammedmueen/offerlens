import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import api from "@/services/api";
import { ENDPOINTS } from "@/constants/api";
import { Button } from "@/components/ui/button";
import ContributionFields from "./ContributionFields";
import { RATE_LIMITED_TEXT, isRateLimited } from "@/lib/quota";
import {
  COOLDOWN_TEXT, buildContributionBody, containsCompanyName, isAlreadySubmitted, setContribState,
  validateContribution,
  type Confirmed, type ContributionBody, type ContributionValues, type FieldKey, type Guards,
} from "@/lib/salary-contribution";

interface Props {
  idPrefix: string;
  initial?: Partial<ContributionValues>;
  /** Only used by the client-side guard. Never sent. */
  companyName?: string | null;
  ctcHint?: string;
  /** Set by the results-page card so a successful send hides that offer's prompt for good. */
  offerId?: string;
  cancelLabel: string;
  focusFirstEmpty?: boolean;
  /** Text for the parent's persistent live region. */
  announce: (message: string) => void;
  onSent: () => void;
  onCancel: () => void;
}

const EMPTY: ContributionValues = { role: "", city: "", years: "", ctc: "", companyType: "", companySize: "" };
const ORDER: FieldKey[] = ["role", "city", "years", "ctc", "companyType"];
const OK_GUARDS: Guards = { role: "ok", city: "ok" };
const NOT_CONFIRMED: Confirmed = { role: false, city: false };

const SalaryContributeForm = ({
  idPrefix, initial, companyName, ctcHint, offerId, cancelLabel, focusFirstEmpty, announce, onSent, onCancel,
}: Props) => {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<ContributionValues>({ ...EMPTY, ...initial });
  const [errors, setErrors] = useState<Partial<Record<FieldKey, string>>>({});
  const [guards, setGuards] = useState<Guards>(OK_GUARDS);
  const [confirmed, setConfirmed] = useState<Confirmed>(NOT_CONFIRMED);
  const [sendError, setSendError] = useState<string | null>(null);
  // Focus is applied after render: the confirm checkbox does not exist until the guard state lands.
  const [focusId, setFocusId] = useState<string | null>(null);
  useEffect(() => {
    if (!focusId) return;
    document.getElementById(focusId)?.focus();
    setFocusId(null);
  }, [focusId]);

  useEffect(() => {
    if (!focusFirstEmpty) return;
    const first = ORDER.find((k) => !values[k]);
    if (first) setFocusId(`${idPrefix}-${first}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, when the form opens
  }, []);

  // Marker + cache invalidation live in the hook options, not mutate(): TanStack drops per-call
  // callbacks if the component unmounts mid-request, and these must still run.
  const send = useMutation({
    mutationFn: (body: ContributionBody) => api.post(ENDPOINTS.SALARIES, body),
    onSuccess: () => {
      if (offerId) setContribState(offerId, "contributed");
      queryClient.invalidateQueries({ queryKey: ["salary-stats"] });
      onSent();
    },
    onError: (err: unknown) => {
      // Order matters: the cooldown 429 shares its code with the limiter's 429.
      if (isAlreadySubmitted(err)) announce(COOLDOWN_TEXT);
      else if (isRateLimited(err)) setSendError(RATE_LIMITED_TEXT);
      else if ((err as { response?: { status?: number } })?.response?.status === 400) {
        setSendError("Some details look wrong. Check the highlighted fields.");
      } else setSendError("We could not send this. Nothing was saved. Your answers are still here; try again.");
    },
  });

  const change = (key: keyof ContributionValues, value: string) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (key in errors) setErrors((e) => ({ ...e, [key]: undefined }));
    if (key === "role" || key === "city") {
      setGuards((g) => ({ ...g, [key]: "ok" }));
      setConfirmed((c) => ({ ...c, [key]: false }));
    }
  };

  const blurGuard = (key: "role" | "city") => {
    const g = containsCompanyName(values[key], companyName);
    setGuards((cur) => ({ ...cur, [key]: g }));
    if (g === "block") setErrors((e) => ({ ...e, [key]: "Remove the company name" }));
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (send.isPending) return; // aria-disabled, not disabled: a second click or Enter lands here
    setSendError(null);
    announce("");
    const g: Guards = {
      role: containsCompanyName(values.role, companyName),
      city: containsCompanyName(values.city, companyName),
    };
    setGuards(g);
    const problems = validateContribution(values, g, confirmed);
    const next: Partial<Record<FieldKey, string>> = {};
    problems.forEach((p) => { next[p.field] = p.message; });
    setErrors(next);
    const body = buildContributionBody(values);
    if (problems.length > 0 || !body) {
      announce(`${problems.length} ${problems.length === 1 ? "field needs" : "fields need"} attention`);
      const first = problems[0];
      if (first) setFocusId(`${idPrefix}-${first.field}${first.focus === "confirm" ? "-confirm" : ""}`);
      return;
    }
    send.mutate(body);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-4">
      <ContributionFields
        idPrefix={idPrefix} values={values} errors={errors} guards={guards} confirmed={confirmed}
        ctcHint={ctcHint} onChange={change} onBlurGuard={blurGuard}
        onConfirm={(k, checked) => setConfirmed((c) => ({ ...c, [k]: checked }))}
      />
      <p className="text-xs text-foreground">
        We will store: role, city, years of experience, yearly CTC, company type and size. We will not store
        your name, account, the company name or your letter. This is the CTC in your offer, not verified pay.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          aria-disabled={send.isPending || undefined}
          aria-busy={send.isPending || undefined}
          variant="outline"
          className="cursor-pointer rounded-xl font-semibold text-foreground"
        >
          {send.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
          Send data point
        </Button>
        <Button type="button" variant="outline" onClick={onCancel} className="cursor-pointer rounded-xl text-foreground">
          {cancelLabel}
        </Button>
      </div>
      {sendError && <p role="alert" className="text-sm font-medium text-foreground">{sendError}</p>}
    </form>
  );
};

export default SalaryContributeForm;
