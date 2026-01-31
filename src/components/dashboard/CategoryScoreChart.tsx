import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Cell, Tooltip } from 'recharts';

interface CategoryData {
  name: string;
  percentage: number;
  color?: string | null;
  weightage?: number;
}

interface CategoryScoreChartProps {
  data: CategoryData[];
}

export function CategoryScoreChart({ data }: CategoryScoreChartProps) {
  if (data.length === 0) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground">
        No category data available
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout="vertical" margin={{ top: 10, right: 30, left: 0, bottom: 10 }}>
        <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
        <YAxis 
          type="category" 
          dataKey="name" 
          width={280}
          tick={{ fontSize: 12, textAnchor: 'end' }}
          tickLine={false}
          tickMargin={8}
          tickFormatter={(value: string, index: number) => {
            const entry = data[index];
            return entry?.weightage != null ? `${value} (${entry.weightage}%)` : value;
          }}
        />
        <Tooltip 
          formatter={(value: number) => [`${value.toFixed(1)}%`, 'Score']}
          contentStyle={{ 
            backgroundColor: 'hsl(var(--card))', 
            border: '1px solid hsl(var(--border))',
            borderRadius: '8px'
          }}
        />
        <Bar dataKey="percentage" radius={[0, 4, 4, 0]}>
          {data.map((entry, index) => (
            <Cell 
              key={`cell-${index}`} 
              fill={entry.color || 'hsl(var(--primary))'} 
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
