import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

// Single-band verdict colour (spec §7): one solid hue per band, no gradient.
// ≥70 green-700, 40–69 amber-700, <40 red-700 — the spec §3.2 honest semantic hexes.
const getColor = (score: number) => {
  if (score >= 70) return "#15803D";
  if (score >= 40) return "#B45309";
  return "#B91C1C";
};

const ScoreGauge: React.FC<ScoreGaugeProps> = ({ score, size = 180 }) => {
  const color = getColor(score);
  const data = [
    { value: score },
    { value: 100 - score },
  ];

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius="70%"
            outerRadius="90%"
            startAngle={90}
            endAngle={-270}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums tracking-tight" style={{ color }}>{score}</span>
        <span className="font-mono text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
};

export default ScoreGauge;
