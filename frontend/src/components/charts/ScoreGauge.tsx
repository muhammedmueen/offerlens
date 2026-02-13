import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

interface ScoreGaugeProps {
  score: number;
  size?: number;
}

const getColor = (score: number) => {
  if (score >= 70) return "hsl(142, 71%, 45%)";
  if (score >= 40) return "hsl(48, 96%, 53%)";
  return "hsl(0, 84%, 60%)";
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
        <span className="text-4xl font-bold" style={{ color }}>{score}</span>
        <span className="text-xs text-muted-foreground">/ 100</span>
      </div>
    </div>
  );
};

export default ScoreGauge;
