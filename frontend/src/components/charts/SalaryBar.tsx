import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine } from "recharts";

interface SalaryBarProps {
  min: number;
  p25: number;
  median: number;
  p75: number;
  max: number;
  userSalary?: number;
  label?: string;
}

const SalaryBar: React.FC<SalaryBarProps> = ({ min, p25, median, p75, max, userSalary, label }) => {
  const data = [
    { name: "Min", value: min },
    { name: "P25", value: p25 },
    { name: "Median", value: median },
    { name: "P75", value: p75 },
    { name: "Max", value: max },
  ];

  const fmt = (v: number) => {
    if (v >= 100000) return `${(v / 100000).toFixed(1)}L`;
    if (v >= 1000) return `${(v / 1000).toFixed(0)}K`;
    return v.toString();
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
            formatter={(value: number) => [`₹${value.toLocaleString()}`, "Salary"]}
          />
          <Bar dataKey="value" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
          {userSalary && (
            <ReferenceLine y={userSalary} stroke="hsl(var(--cta))" strokeDasharray="4 4" label={{ value: "Your Offer", fill: "hsl(var(--cta))", fontSize: 11 }} />
          )}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SalaryBar;
