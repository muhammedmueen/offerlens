import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface BenefitItem {
  name: string;
  value: number;
}

interface BenefitsPieProps {
  data: BenefitItem[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--cta))",
  "hsl(var(--secondary))",
  "hsl(142, 71%, 45%)",
  "hsl(280, 65%, 60%)",
  "hsl(48, 96%, 53%)",
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
