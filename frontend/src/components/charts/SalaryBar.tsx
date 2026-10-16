import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

/**
 * Props mirror the percentiles the API actually produces.
 *
 * This previously asked for `min`, `median` and `max`. Neither the analysis
 * `salaryComparison.marketRange` nor `GET /salaries/stats` returns those, so three of
 * the five bars silently rendered `undefined` at both call sites.
 */
interface SalaryBarProps {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  /** The user's own offer, drawn as a reference line. */
  userSalary?: number;
  /** 5.6: the offer was not ranked against this range, so no marker (a line on the bars reads as a placement). */
  hideOffer?: boolean;
  label?: string;
}

const SalaryBar: React.FC<SalaryBarProps> = ({ p25, p50, p75, p90, userSalary, hideOffer, label }) => {
  const data = [
    { name: "P25", value: p25 },
    { name: "Median", value: p50 },
    { name: "P75", value: p75 },
    { name: "P90", value: p90 },
  ];

  const fmt = (v: number) => {
    if (v >= 10000000) return `${(v / 10000000).toFixed(1)}Cr`;
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return String(v);
  };

  return (
    <div className="w-full">
      {label && <p className="text-sm text-muted-foreground mb-2">{label}</p>}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
          <XAxis dataKey="name" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 12 }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={fmt} />
          <Tooltip
            contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
            formatter={(value: number) => [`₹${value.toLocaleString("en-IN")}`, "Salary"]}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          {userSalary && !hideOffer ? (
            // ink marker (stone-900) over cyan bars — the offer line must not blend into the accent bars
            <ReferenceLine y={userSalary} stroke="hsl(var(--foreground))" strokeDasharray="4 4" label={{ value: "Your Offer", fill: "hsl(var(--foreground))", fontSize: 11 }} />
          ) : null}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SalaryBar;
