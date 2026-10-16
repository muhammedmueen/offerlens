import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface BenefitItem {
  name: string;
  value: number;
}

interface BenefitsPieProps {
  data: BenefitItem[];
}

// Categorical palette on the spec identity (§3): cyan accent + stone neutrals + the
// honest semantic hues, so slices stay distinct without introducing a second brand colour.
const COLORS = [
  "#0E7490", // cyan-700  (accent)
  "#6D28D9", // violet-700 (estimate family)
  "#15803D", // green-700
  "#B45309", // amber-700
  "#78716C", // stone-500
  "#B91C1C", // red-700
];

const BenefitsPie: React.FC<BenefitsPieProps> = ({ data }) => (
  <ResponsiveContainer width="100%" height={250}>
    <PieChart>
      <Pie data={data} cx="50%" cy="50%" outerRadius={80} dataKey="value" nameKey="name" label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
        {data.map((_, i) => (
          <Cell key={i} fill={COLORS[i % COLORS.length]} />
        ))}
      </Pie>
      <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
    </PieChart>
  </ResponsiveContainer>
);

export default BenefitsPie;
