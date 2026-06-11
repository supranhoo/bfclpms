import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

interface OverallScoreChartProps {
  percentage: number;
  rating?: number;
}

export function OverallScoreChart({ percentage, rating }: OverallScoreChartProps) {
  const getColor = (pct: number) => {
    if (pct >= 80) return 'hsl(142, 76%, 36%)'; // green-600
    if (pct >= 60) return 'hsl(217, 91%, 60%)'; // blue-500
    if (pct >= 40) return 'hsl(45, 93%, 47%)';  // yellow-500
    return 'hsl(0, 84%, 60%)'; // red-500
  };

  const scoreColor = getColor(percentage);

  const data = [
    { name: 'Achieved', value: percentage },
    { name: 'Remaining', value: Math.max(0, 100 - percentage) },
  ];

  return (
    <div className="relative h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={35}
            outerRadius={50}
            paddingAngle={0}
            dataKey="value"
            startAngle={90}
            endAngle={-270}
          >
            <Cell fill={scoreColor} />
            <Cell fill="hsl(var(--muted))" />
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="absolute inset-0 flex items-center justify-center flex-col">
        <span className="text-base font-bold text-foreground leading-none">{percentage.toFixed(1)}%</span>
        {rating !== undefined && (
          <span className="text-xs text-muted-foreground">{rating.toFixed(2)}/5</span>
        )}
      </div>
    </div>
  );
}
