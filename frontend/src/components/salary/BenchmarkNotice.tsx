import { Globe } from "lucide-react";
import { DATASET_URL, ODBL_URL, SO_SURVEY_URL } from "@/constants/attribution";

interface BenchmarkNoticeProps {
  /** Unknown or missing values render as AI-estimated, matching the backend. */
  dataSource?: string | null;
  sampleSize?: number;
  /** The stored disclaimer. For public_survey it already says "Modelled from public surveys, not offers in your city." */
  disclaimer?: string | null;
  /** Crowdsourced only (5.7): which kind of pay served the number; 'mixed' = pooled across kinds. */
  payBasis?: "offered" | "current" | "mixed" | null;
  payMix?: PayMix | null;
}

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
const BenchmarkNotice = ({ dataSource, sampleSize, disclaimer, payBasis, payMix }: BenchmarkNoticeProps) => {
  if (dataSource === "public_survey") {
    return (
      <aside aria-label="Salary benchmark source" className="mt-2 space-y-1 text-sm text-foreground">
        <p className="flex items-center gap-1.5 font-medium">
          <Globe className="h-4 w-4" aria-hidden="true" />
          Public survey, India-wide
        </p>
        {disclaimer && <p>{disclaimer}</p>}
        {typeof sampleSize === "number" && <p>n = {sampleSize} respondents</p>}
        <p>
          Contains information from the{" "}
          <ExternalLink href={SO_SURVEY_URL}>Stack Overflow Developer Survey 2025</ExternalLink> (Stack Exchange Inc.),
          made available under the{" "}
          <ExternalLink href={ODBL_URL}>Open Database License (ODbL)</ExternalLink>.{" "}
          <ExternalLink href={DATASET_URL}>Download the derived dataset</ExternalLink>.
        </p>
      </aside>
    );
  }

  const label = dataSource === "crowdsourced" ? payBasisLabel(payBasis, payMix) : null;
  const base =
    dataSource === "crowdsourced"
      ? `Based on crowdsourced submissions${typeof sampleSize === "number" ? ` (n = ${sampleSize})` : ""}${label ? `, ${label}` : ""}`
      : "AI-estimated range — not benchmarked against real submissions";
  return (
    <p className="mt-2 text-xs text-muted-foreground">
      {base}
      {disclaimer ? ` · ${disclaimer}` : ""}
    </p>
  );
};

export default BenchmarkNotice;
