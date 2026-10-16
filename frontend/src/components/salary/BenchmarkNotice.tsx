import { FlaskConical, Globe, Users } from "lucide-react";
import { DATASET_URL, ODBL_URL, PLFS_DATASET_URL, PLFS_URL, SO_SURVEY_URL } from "@/constants/attribution";

interface BenchmarkNoticeProps {
  /** Unknown or missing values render as AI-estimated, matching the backend. */
  dataSource?: string | null;
  sampleSize?: number;
  /** The stored disclaimer. For public_survey it already says "Modelled from public surveys, not offers in your city." */
  disclaimer?: string | null;
  /** Crowdsourced only (5.7): which kind of pay served the number; 'mixed' = pooled across kinds. */
  payBasis?: "offered" | "current" | "mixed" | null;
  payMix?: PayMix | null;
  /** Survey only (5.1b): set when the national figures were scaled by a PLFS city factor. */
  cityAdjustment?: CityAdjustment | null;
}

/** Mirrors the backend `CityAdjustment` (city-adjustment.ts); only the fields shown here. */
export interface CityAdjustment { cityLabel: string; factor: number; plfsSampleSize: number }

export interface PayMix { offered: number; current: number; unlabelled: number }

/** A short visible label for the pay kind behind a crowd number. Null when the response carries none (older analyses). */
function payBasisLabel(payBasis: BenchmarkNoticeProps["payBasis"], payMix?: PayMix | null): string | null {
  if (payBasis === "offered") return "offered pay";
  if (payBasis === "current") return "current pay";
  if (payBasis !== "mixed") return null;
  const o = payMix?.offered ?? 0;
  const c = payMix?.current ?? 0;
  if (o > 0 && c > 0) return "offered and current pay mixed";
  if (o > 0) return "offered pay and unlabelled";
  if (c > 0) return "current pay and unlabelled";
  return "pay type not recorded";
}

const LINK =
  "underline underline-offset-2 text-primary rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function ExternalLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className={LINK}>
      {children}
    </a>
  );
}

/**
 * Says where a salary benchmark came from. Modelled survey numbers are never described as
 * submissions: the public_survey branch has its own wording, a visible text label (not just
 * an icon or colour) and the ODbL attribution with real links.
 */
const BenchmarkNotice = ({ dataSource, sampleSize, disclaimer, payBasis, payMix, cityAdjustment }: BenchmarkNoticeProps) => {
  if (dataSource === "public_survey") {
    // Modelled treatment (spec §3.2 / §7): violet-700 text, a dashed violet top rule and the
    // literal word "Modelled" — a different hue family + border style so an estimate can never
    // read as the solid-green Verified state. The disclaimer prose and attribution are untouched.
    return (
      <aside
        aria-label="Salary benchmark source"
        className="mt-2 space-y-1 border-t border-dashed border-violet-200 pt-2 text-sm text-foreground"
      >
        <p className="flex items-center gap-1.5 font-medium text-violet-700">
          <FlaskConical className="h-4 w-4" aria-hidden="true" />
          <span className="font-mono text-xs uppercase tracking-wide">Modelled</span>
          <Globe className="h-4 w-4" aria-hidden="true" />
          {cityAdjustment ? `Public survey, adjusted for ${cityAdjustment.cityLabel}` : "Public survey, India-wide"}
        </p>
        {disclaimer && <p>{disclaimer}</p>}
        {typeof sampleSize === "number" && <p>n = {sampleSize} respondents</p>}
        {cityAdjustment && (
          <p>
            City factor x{cityAdjustment.factor.toFixed(2)} from PLFS 2023-24 (n = {cityAdjustment.plfsSampleSize}). An
            estimate for {cityAdjustment.cityLabel}, not offers there.
          </p>
        )}
        <p>
          Contains information from the{" "}
          <ExternalLink href={SO_SURVEY_URL}>Stack Overflow Developer Survey 2025</ExternalLink> (Stack Exchange Inc.),
          made available under the{" "}
          <ExternalLink href={ODBL_URL}>Open Database License (ODbL)</ExternalLink>.{" "}
          <ExternalLink href={DATASET_URL}>Download the derived dataset</ExternalLink>.
        </p>
        {cityAdjustment && (
          <p>
            City adjustment derived from the{" "}
            <ExternalLink href={PLFS_URL}>Periodic Labour Force Survey 2023-24</ExternalLink>, National Statistics
            Office, MoSPI. <ExternalLink href={PLFS_DATASET_URL}>Download the city factors</ExternalLink>.
          </p>
        )}
      </aside>
    );
  }

  const isCrowd = dataSource === "crowdsourced";
  const label = isCrowd ? payBasisLabel(payBasis, payMix) : null;
  const base = isCrowd
    ? `Based on crowdsourced submissions${typeof sampleSize === "number" ? ` (n = ${sampleSize})` : ""}${label ? `, ${label}` : ""}`
    : "AI-estimated range — not benchmarked against real submissions";
  // Crowdsourced carries the Users/Globe mark; AI-estimated stays label-only. Both use
  // text-stone-500 (ink-3, 4.80:1 on white) — never a lighter muted token (spec §7).
  return (
    <p className="mt-2 flex items-start gap-1.5 text-xs text-stone-500">
      {isCrowd && <Users className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <span>
        {base}
        {disclaimer ? ` · ${disclaimer}` : ""}
      </span>
    </p>
  );
};

export default BenchmarkNotice;
