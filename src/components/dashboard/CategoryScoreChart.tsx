import { useRef, useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip, CartesianGrid } from 'recharts';
import { Button } from '@/components/ui/button';
import { ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react';

export type CategorySortBy = 'weightage-desc' | 'weightage-asc' | 'score-desc' | 'score-asc';

interface CategoryData {
  name: string;
  percentage: number;
  color?: string | null;
  weightage?: number;
}

interface CategoryScoreChartProps {
  data: CategoryData[];
  sortBy?: CategorySortBy;
  onSortChange?: (sortBy: CategorySortBy) => void;
}

interface CustomTickProps {
  x?: number;
  y?: number;
  payload?: { value: string; index: number };
}

export function CategoryScoreChart({ data, sortBy = 'score-desc', onSortChange }: CategoryScoreChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [yAxisWidth, setYAxisWidth] = useState(210);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setYAxisWidth(Math.max(220, Math.round(entry.contentRect.width * 0.35)));
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const sortedData = useMemo(() => {
    return [...data].sort((a, b) => {
      if (sortBy === 'weightage-desc') return (b.weightage || 0) - (a.weightage || 0);
      if (sortBy === 'weightage-asc') return (a.weightage || 0) - (b.weightage || 0);
      if (sortBy === 'score-asc') return a.percentage - b.percentage;
      return b.percentage - a.percentage; // score-desc default
    });
  }, [data, sortBy]);

  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No category data available
      </div>
    );
  }

  const CustomYAxisTick = ({ x, y, payload }: CustomTickProps) => {
    if (!payload || x == null || y == null) return null;
    const entry = sortedData[payload.index];
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
      {onSortChange && (
        <div className="flex items-center justify-end gap-1 mb-2">
          <span className="text-xs text-muted-foreground mr-1">Sort:</span>
          {(['weightage', 'score'] as const).map((field) => {
            const isActive = sortBy.startsWith(field);
            const isDesc = sortBy === `${field}-desc`;
            const DirectionIcon = isActive ? (isDesc ? ArrowDown : ArrowUp) : ArrowUpDown;
            return (
              <Button
                key={field}
                variant={isActive ? 'secondary' : 'ghost'}
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                onClick={() => {
                  if (isActive) {
                    onSortChange(`${field}-${isDesc ? 'asc' : 'desc'}` as CategorySortBy);
                  } else {
                    onSortChange(`${field}-desc` as CategorySortBy);
                  }
                }}
              >
                {field === 'weightage' ? 'Weightage' : 'Score'}
                <DirectionIcon className="h-3 w-3" />
              </Button>
            );
          })}
        </div>
      )}
      <ResponsiveContainer width="100%" height={onSortChange ? "90%" : "100%"}>
        <BarChart
          data={sortedData}
          layout="vertical"
          margin={{ top: 4, right: 30, left: 0, bottom: 4 }}
          barCategoryGap="2%"
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
            interval={0}
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
          <Bar dataKey="percentage" radius={[0, 4, 4, 0]} barSize={12}>
            {sortedData.map((entry, index) => (
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
