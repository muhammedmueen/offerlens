import BenchmarkNotice, { type CityAdjustment } from "@/components/salary/BenchmarkNotice";

/** The career response's `progression` key (5.5). Every field is optional: an older response has none. */
interface Cell {
  bracket: string;
  sampleSize: number;
  crowdN: number;
  source: "public_survey" | "crowdsourced" | null;
  marketRange: { p25: number; p50: number; p75: number } | null;
  step: { absolute: number; percent: number } | null;
}

export interface Progression {
  applicable?: boolean;
  reason?: string;
  roleUsed?: string;
  cityUsed?: string;
  currentBracket?: string | null;
  cells?: Cell[];
  notes?: Array<{ source: "public_survey" | "crowdsourced"; disclaimer: string }>;
  /** 5.1b: survey cells are national figures scaled by this PLFS city factor. Crowd cells never are. */
  cityAdjustment?: CityAdjustment | null;
}

// Phrased to avoid "unavailable" / "failed to load": the smoke spec treats those as a broken drawer.
const FALLBACK: Record<string, string> = {
  role_not_covered: "We only have survey pay data for common software roles, so there are no pay figures for this role.",
  non_inr: "Survey figures are in rupees, so they are not shown for an offer in another currency.",
  city_not_covered: "The survey data is India-wide but only used for six major metros; this offer's location isn't one of them.",
  lookup_error: "Pay figures could not be loaded this time. Reopen this panel to try again.",
};

// No lakh/LPA helper exists in the app; this is the same en-IN grouping the results page uses.
const inr = (n: number) => `₹${n.toLocaleString("en-IN")}`;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Both signs come from the absolute change. The percent is rounded, so a small move can be 0%:
// that prints unsigned ("−₹1,000 (0%)") instead of contradicting the amount.
function stepText(s: NonNullable<Cell["step"]>): string {
  if (s.absolute === 0) return "No change";
  const sign = s.absolute < 0 ? "−" : "+";
  const pct = s.percent === 0 ? "" : sign;
  return `${sign}${inr(Math.abs(s.absolute))} (${pct}${Math.abs(s.percent)}%)`;
}

function basedOn(c: Cell, cityUsed?: string, adj?: CityAdjustment | null): string {
  return c.source === "crowdsourced"
    ? `${plural(c.sampleSize, "crowdsourced submission", "crowdsourced submissions")}, ${cityUsed ?? "this city"}`
    : `${plural(c.sampleSize, "survey respondent", "survey respondents")}, India-wide${adj ? `, scaled to ${adj.cityLabel}` : ""}`;
}

function thinText(c: Cell): string {
  const crowd = c.crowdN > 0 ? `, ${c.crowdN} crowdsourced` : "";
  return `Not enough data (${plural(c.sampleSize, "survey respondent", "survey respondents")}${crowd}; at least 10 needed)`;
}

/**
 * Pay by years of experience, from public survey data (and crowdsourced rows where a cell has 10).
 * A cell with too few points shows its sample size and NO number; nothing is filled in across gaps.
 * Renders nothing when the response has no `progression` (an older cached response).
 */
const CareerProgression = ({ progression }: { progression?: Progression | null }) => {
  if (!progression) return null;

  const heading = <h4 className="mb-2 text-sm font-semibold text-foreground">Pay by years of experience</h4>;

  if (!progression.applicable || !Array.isArray(progression.cells)) {
    return (
      <section>
        {heading}
        <p className="text-sm text-foreground">
          {FALLBACK[progression.reason ?? ""] ?? "There are no pay figures for this role."}
        </p>
      </section>
    );
  }

  const cells = progression.cells;
  const anyNumbers = cells.some((c) => c.marketRange);
  const survey = progression.notes?.find((n) => n.source === "public_survey");
  const crowd = progression.notes?.find((n) => n.source === "crowdsourced");

  return (
    <section>
      {heading}
      {!anyNumbers && (
        <p className="mb-2 text-sm text-foreground">
          There isn&apos;t enough survey data to show pay growth for this role at any experience level.
        </p>
      )}
      <div
        className="overflow-x-auto rounded-lg border border-border"
        role="region"
        aria-label="Pay by years of experience table"
        tabIndex={0}
      >
        <table className="w-full text-left text-sm text-foreground">
          <caption className="sr-only">
            Typical annual pay for {progression.roleUsed ?? "this role"}, by years of experience
          </caption>
          <thead>
            <tr className="border-b border-border">
              <th scope="col" className="p-2 font-semibold">Experience</th>
              <th scope="col" className="p-2 font-semibold">Median</th>
              <th scope="col" className="p-2 font-semibold">Middle half (25th-75th)</th>
              <th scope="col" className="p-2 font-semibold">Change from previous</th>
              <th scope="col" className="p-2 font-semibold">Based on</th>
            </tr>
          </thead>
          <tbody>
            {cells.map((c) => (
              <tr key={c.bracket} className="border-b border-border last:border-0">
                <th scope="row" className="p-2 font-medium">
                  {c.bracket}
                  {c.bracket === progression.currentBracket && " (your level)"}
                </th>
                {c.marketRange ? (
                  <>
                    <td className="p-2">{inr(c.marketRange.p50)}</td>
                    <td className="p-2">{inr(c.marketRange.p25)} to {inr(c.marketRange.p75)}</td>
                    <td className="whitespace-nowrap p-2">{c.step ? stepText(c.step) : "No comparison"}</td>
                    <td className="p-2">{basedOn(c, progression.cityUsed, progression.cityAdjustment)}</td>
                  </>
                ) : (
                  <td colSpan={4} className="p-2">{thinText(c)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {survey && (
        <BenchmarkNotice dataSource="public_survey" disclaimer={survey.disclaimer} cityAdjustment={progression.cityAdjustment} />
      )}
      {/* Not BenchmarkNotice: its crowdsourced branch is text-muted-foreground, under the 4.5:1 contrast floor. */}
      {crowd && <p className="mt-2 text-sm text-foreground">{crowd.disclaimer}</p>}
    </section>
  );
};

export default CareerProgression;
