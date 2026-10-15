import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { COMPANY_SIZES, COMPANY_TYPES, type ContributionValues, type FieldKey, type Guards, type Confirmed } from "@/lib/salary-contribution";

interface Props {
  idPrefix: string;
  values: ContributionValues;
  errors: Partial<Record<FieldKey, string>>;
  guards: Guards;
  confirmed: Confirmed;
  ctcHint?: string;
  /** Ask whether the CTC is current or offered pay. Off in the results-page card, which knows it is offered. */
  showPayBasis?: boolean;
  onChange: (key: keyof ContributionValues, value: string) => void;
  onConfirm: (key: "role" | "city", checked: boolean) => void;
  onBlurGuard: (key: "role" | "city") => void;
}

/** The inputs only: labels, hints, per-field errors and the "general term" confirmations. */
const PAY_BASIS_OPTIONS = [
  { value: "current", label: "Current pay" },
  { value: "offered", label: "Offered pay" },
  { value: "unsure", label: "Not sure" },
] as const;

const ContributionFields = ({ idPrefix, values, errors, guards, confirmed, ctcHint, showPayBasis, onChange, onConfirm, onBlurGuard }: Props) => {
  const id = (k: string) => `${idPrefix}-${k}`;
  const describedBy = (k: FieldKey, hint?: boolean) =>
    [hint ? `${id(k)}-hint` : null, errors[k] ? `${id(k)}-error` : null].filter(Boolean).join(" ") || undefined;
  const err = (k: FieldKey) => errors[k] && (
    <p id={id(`${k}-error`)} className="text-sm font-medium text-foreground">{errors[k]}</p>
  );
  const confirmBox = (k: "role" | "city", text: string) => guards[k] === "warn" && (
    <label className="flex items-start gap-2 text-sm text-foreground">
      <input
        id={id(`${k}-confirm`)}
        type="checkbox"
        className="mt-1 h-4 w-4"
        checked={confirmed[k]}
        onChange={(e) => onConfirm(k, e.target.checked)}
      />
      {text}
    </label>
  );

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={id("role")}>Job title</Label>
        <Input
          id={id("role")} value={values.role} maxLength={120} autoComplete="off"
          onChange={(e) => onChange("role", e.target.value)} onBlur={() => onBlurGuard("role")}
          aria-invalid={!!errors.role} aria-describedby={describedBy("role", true)}
        />
        <p id={id("role-hint")} className="text-xs text-foreground">
          Use a general title, for example Backend Engineer. Do not include the company or team name.
        </p>
        {confirmBox("role", "This is a general job title, not the company name")}
        {err("role")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("city")}>City</Label>
        <Input
          id={id("city")} value={values.city} maxLength={120} autoComplete="off"
          onChange={(e) => onChange("city", e.target.value)} onBlur={() => onBlurGuard("city")}
          aria-invalid={!!errors.city} aria-describedby={describedBy("city")}
        />
        {confirmBox("city", "This is a general place, not the company name")}
        {err("city")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("years")}>Years of experience</Label>
        <Input
          id={id("years")} value={values.years} inputMode="numeric" autoComplete="off"
          onChange={(e) => onChange("years", e.target.value)}
          aria-invalid={!!errors.years} aria-describedby={describedBy("years")}
        />
        {err("years")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("ctc")}>{showPayBasis ? "Yearly CTC (₹)" : "Yearly CTC in the offer (₹)"}</Label>
        <Input
          id={id("ctc")} value={values.ctc} inputMode="numeric" autoComplete="off"
          onChange={(e) => onChange("ctc", e.target.value)}
          aria-invalid={!!errors.ctc} aria-describedby={describedBy("ctc", !!ctcHint)}
        />
        {ctcHint && <p id={id("ctc-hint")} className="text-xs text-foreground">{ctcHint}</p>}
        {err("ctc")}
      </div>
      {showPayBasis && (
        // Native radios: real labelled inputs, arrow keys move within the group, nothing preselected.
        // role="radiogroup" because aria-invalid is not supported on the implicit "group" role of a fieldset.
        <fieldset className="space-y-2" role="radiogroup" aria-invalid={!!errors.payBasis} aria-describedby={describedBy("payBasis")}>
          <legend className="text-sm font-medium leading-none text-foreground">What kind of pay is this?</legend>
          {PAY_BASIS_OPTIONS.map((o, i) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-foreground">
              <input
                id={i === 0 ? id("payBasis") : undefined}
                type="radio"
                name={id("payBasis")}
                value={o.value}
                checked={values.payBasis === o.value}
                onChange={() => onChange("payBasis", o.value)}
                className="h-4 w-4 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              {o.label}
            </label>
          ))}
          {err("payBasis")}
        </fieldset>
      )}
      <div className="space-y-2">
        <Label htmlFor={id("companyType")}>Company type</Label>
        <Select value={values.companyType} onValueChange={(v) => onChange("companyType", v)}>
          <SelectTrigger
            id={id("companyType")} className="cursor-pointer"
            aria-invalid={!!errors.companyType} aria-describedby={describedBy("companyType")}
          >
            <SelectValue placeholder="Select type" />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
          </SelectContent>
        </Select>
        {err("companyType")}
      </div>
      <div className="space-y-2">
        <Label htmlFor={id("companySize")}>Company size (optional)</Label>
        <Select value={values.companySize} onValueChange={(v) => onChange("companySize", v)}>
          <SelectTrigger id={id("companySize")} className="cursor-pointer">
            <SelectValue placeholder="Select size" />
          </SelectTrigger>
          <SelectContent>
            {COMPANY_SIZES.map((s) => <SelectItem key={s} value={s}>{s} employees</SelectItem>)}
          </SelectContent>
        </Select>
      </div>
    </>
  );
};

export default ContributionFields;
