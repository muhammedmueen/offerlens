/**
 * Task 5.4: offering the user's own offer as ONE salary data point through the existing
 * POST /salaries. Everything here is pure (except the two localStorage helpers) so the gating,
 * prefill, validation and payload rules are unit-tested without rendering.
 *
 * Privacy: the body is built from a fixed key list. Nothing from the analysis (offer id, company
 * name, raw text) can reach the request because nothing here spreads it.
 */

export const COMPANY_TYPES = [
  { value: "product", label: "Product" },
  { value: "service", label: "Service / Consulting" },
  { value: "startup", label: "Startup" },
  { value: "mnc", label: "MNC" },
  { value: "other", label: "Other" },
] as const;
export const COMPANY_SIZES = ["1-10", "11-50", "51-200", "201-1000", "1000+"] as const;

export const MAX_CTC = 1_000_000_000;

export interface ContributionAnalysis {
  offerStatus?: string | null;
  lowConfidence?: boolean | null;
  confidence?: {
    caveat?: string | null;
    fields?: Record<string, { level?: string } | undefined>;
  } | null;
  extractedData?: {
    role?: string | null;
    location?: string | null;
    companyName?: string | null;
    companyType?: string | null;
    employmentType?: string | null;
    compensation?: { totalCTC?: number | null; currency?: string | null } | null;
  } | null;
}

export interface ContributionValues {
  role: string;
  city: string;
  years: string;
  ctc: string;
  companyType: string;
  companySize: string;
}

export type FieldKey = "role" | "city" | "years" | "ctc" | "companyType";
export type Guard = "block" | "warn" | "ok";

export interface ContributionBody {
  role: string;
  city: string;
  experienceYears: number;
  ctc: number;
  companyType: string;
  companySize?: string;
}

/** Whether to show the prompt at all. `dismissed` is passed in so this stays pure. */
export function shouldOfferContribution(a: ContributionAnalysis | null | undefined, dismissed: boolean): boolean {
  if (!a || dismissed) return false;
  if (a.offerStatus && a.offerStatus !== "COMPLETED") return false;
  if (a.lowConfidence) return false;
  if (a.confidence?.caveat) return false;
  const d = a.extractedData;
  const ctc = d?.compensation?.totalCTC;
  if (typeof ctc !== "number" || !Number.isFinite(ctc) || ctc <= 0 || ctc > MAX_CTC) return false;
  // Absent evidence is not evidence: when the confidence step threw, fields is {} and we show nothing.
  const level = a.confidence?.fields?.totalCTC?.level;
  if (level !== "high" && level !== "medium") return false;
  if ((d?.compensation?.currency ?? "").trim().toUpperCase() !== "INR") return false;
  if (d?.employmentType !== "full-time") return false;
  return typeof d?.role === "string" && d.role.trim().length > 0;
}

/** Nearest 10,000 so an untouched prefill is not byte-equal to the stored analysis (3.2). */
export function roundCtc(x: number): number {
  const r = Math.round(x / 10_000) * 10_000;
  return r === 0 ? Math.round(x) : r;
}

const TYPE_MAP: Record<string, string> = {
  product: "product", service: "service", startup: "startup", mnc: "mnc",
  government: "other", education: "other", other: "other",
};

export function buildPrefill(a: ContributionAnalysis): ContributionValues {
  const d = a.extractedData;
  const city = (d?.location ?? "").trim().slice(0, 120);
  const ctc = d?.compensation?.totalCTC;
  return {
    role: (d?.role ?? "").trim().slice(0, 120),
    city: /^remote$/i.test(city) ? "" : city,
    years: "", // never guessed
    ctc: typeof ctc === "number" ? String(roundCtc(ctc)) : "",
    companyType: TYPE_MAP[(d?.companyType ?? "").trim().toLowerCase()] ?? "",
    companySize: "",
  };
}

// ── Company-name guard (client-side only; the server never sees the company name) ──────────────
const LEGAL = new Set("pvt private ltd limited llp inc corp corporation co company the and".split(" "));
const GENERIC = new Set((
  "technologies technology tech solutions services systems india global group labs "
  + "engineer engineering developer development software data cloud analyst analytics manager "
  + "consultant consulting consultancy financial digital bank centre center research design"
).split(" "));

const hasWord = (value: string, token: string) =>
  new RegExp(`(^|[^\\p{L}])${token}($|[^\\p{L}])`, "iu").test(value);

/**
 * 'block' = the brand (first significant) token appears; 'warn' = a later token, a 2-letter brand
 * or the company's initials appear and the user must confirm it is a general title; else 'ok'.
 * ponytail: a guard against an accidental leak, not a security control. It cannot know a team or
 * product codename that is not in the company name.
 */
export function containsCompanyName(value: string, companyName: string | null | undefined): Guard {
  if (!companyName || !value) return "ok";
  const tokens = companyName.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean).filter((t) => !LEGAL.has(t));
  const significant = tokens.filter((t) => t.length > 1 && !GENERIC.has(t));
  if (significant.length === 0) return "ok";
  let result: Guard = "ok";
  const [brand, ...later] = significant;
  if (hasWord(value, brand)) return brand.length === 2 ? "warn" : "block";
  if (later.some((t) => hasWord(value, t))) result = "warn";
  if (tokens.length >= 3 && hasWord(value, tokens.map((t) => t[0]).join(""))) result = "warn";
  return result;
}

// ── Validation (mirrors salary.schema.ts) ──────────────────────────────────────────────────────
export const CTC_DIGITS_MESSAGE = "Enter digits only, for example 2400000";

export interface Problem {
  field: FieldKey;
  message: string;
  /** Focus the field itself, or its "this is a general title" checkbox. */
  focus: "field" | "confirm";
}

/** Shape problems only, in DOM order. No company guard. */
export function basicProblems(v: ContributionValues): Problem[] {
  const out: Problem[] = [];
  const add = (field: FieldKey, message: string) => out.push({ field, message, focus: "field" });
  const role = v.role.trim();
  const city = v.city.trim();
  if (role.length < 2 || role.length > 120) add("role", "Enter a job title of 2 to 120 characters");
  if (city.length < 2 || city.length > 120) add("city", "Enter a city of 2 to 120 characters");
  const years = v.years.trim();
  if (!/^\d+$/.test(years) || Number(years) > 60) add("years", "Enter whole years of experience from 0 to 60");
  const ctc = v.ctc.trim();
  if (!/^\d+$/.test(ctc)) add("ctc", CTC_DIGITS_MESSAGE);
  else if (Number(ctc) < 1 || Number(ctc) > MAX_CTC) add("ctc", CTC_DIGITS_MESSAGE);
  if (!COMPANY_TYPES.some((t) => t.value === v.companyType)) add("companyType", "Choose a company type");
  return out;
}

export type Guards = Record<"role" | "city", Guard>;
export type Confirmed = Record<"role" | "city", boolean>;

/** Everything that must hold before Send: shape plus the company-name guard. Order = DOM order. */
export function validateContribution(v: ContributionValues, guards: Guards, confirmed: Confirmed): Problem[] {
  const out = basicProblems(v);
  const has = (f: FieldKey) => out.some((p) => p.field === f);
  for (const f of ["role", "city"] as const) {
    if (has(f)) continue;
    if (guards[f] === "block") out.push({ field: f, message: "Remove the company name", focus: "field" });
    else if (guards[f] === "warn" && !confirmed[f]) {
      out.push({ field: f, message: "Confirm this is a general term, or change it", focus: "confirm" });
    }
  }
  const order: FieldKey[] = ["role", "city", "years", "ctc", "companyType"];
  return out.sort((a, b) => order.indexOf(a.field) - order.indexOf(b.field));
}

/** The request body: a fixed key list, or null when the shape is invalid (blank years would coerce to 0 server-side). */
export function buildContributionBody(v: ContributionValues): ContributionBody | null {
  if (basicProblems(v).length > 0) return null;
  return {
    role: v.role.trim(),
    city: v.city.trim(),
    experienceYears: Number(v.years.trim()),
    ctc: Number(v.ctc.trim()),
    companyType: v.companyType,
    ...(v.companySize ? { companySize: v.companySize } : {}),
  };
}

// ── Errors ─────────────────────────────────────────────────────────────────────────────────────
interface ApiErrorLike {
  response?: { status?: number; data?: { error?: { details?: { reason?: string } } } };
}

/** The 1 h per-browser cooldown. It shares code RATE_LIMIT_EXCEEDED with the limiter, so test it FIRST. */
export function isAlreadySubmitted(err: unknown): boolean {
  const res = (err as ApiErrorLike)?.response;
  return res?.status === 429 && res.data?.error?.details?.reason === "ALREADY_SUBMITTED";
}

export const COOLDOWN_TEXT =
  "You already shared a data point from this browser in the last hour. You can share another one later.";

// ── Per-offer memory (never sent anywhere) ─────────────────────────────────────────────────────
export type ContribState = "dismissed" | "contributed";
const stateKey = (offerId: string) => `salary_contrib:v1:${offerId}`;

export function getContribState(offerId: string): ContribState | null {
  try {
    const v = localStorage.getItem(stateKey(offerId));
    return v === "dismissed" || v === "contributed" ? v : null;
  } catch {
    return null; // private mode: show once per page load, the safe direction
  }
}

export function setContribState(offerId: string, state: ContribState): void {
  try {
    localStorage.setItem(stateKey(offerId), state);
  } catch { /* ignore */ }
}
