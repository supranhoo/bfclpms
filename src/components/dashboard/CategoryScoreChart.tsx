import { useRef, useState, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid } from 'recharts';

interface CategoryData {
  name: string;
  percentage: number;
  color?: string | null;
  weightage?: number;
}

interface CategoryScoreChartProps {
  data: CategoryData[];
}

interface CustomTickProps {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
}

export function CategoryScoreChart({ data }: CategoryScoreChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [yAxisWidth, setYAxisWidth] = useState(280);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setYAxisWidth(Math.round(entry.contentRect.width * 0.4));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No category data available
      </div>
    );
  }

  const CustomYAxisTick = ({ x, y, payload }: CustomTickProps) => {
    if (!payload || x == null || y == null) return null;
    const entry = data[payload.index];
    const weightage = entry?.weightage != null ? ` (${entry.weightage}%)` : '';
    return (
      <g transform={`translate(${x},${y})`}>
        <text textAnchor="end" fontSize={12} dominantBaseline="middle" fontFamily="Inter, sans-serif">
          <tspan fontWeight={500} fill="hsl(var(--foreground))">{payload.value}</tspan>
          <tspan fontWeight={400} fill="hsl(var(--muted-foreground))">{weightage}</tspan>
        </text>
      </g>
    );
  };

  return (
    <div ref={containerRef} className="h-full w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 10, right: 30, left: 0, bottom: 10 }}
          barCategoryGap="30%"
        >
          <CartesianGrid
            horizontal={false}
            stroke="hsl(var(--border))"
            strokeDasharray="3 3"
          />
          <XAxis
            type="number"
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={yAxisWidth}
            tick={(props: CustomTickProps) => <CustomYAxisTick {...props} />}
            tickLine={false}
            tickMargin={8}
          />
          <Tooltip
            formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '8px',
            }}
          />
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={20}>
            {data.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || 'hsl(var(--primary))'}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
