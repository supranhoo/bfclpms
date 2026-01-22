import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, ResponsiveContainer, Legend } from 'recharts';
import { IssueSummary, IssueType, ISSUE_TYPE_LABELS } from '@/hooks/useSystemIssues';

interface IssuesByTypeChartProps {
  summary: IssueSummary;
}

const CHART_COLORS: Record<IssueType, string> = {
  query: 'hsl(var(--warning))',
  training_need: 'hsl(346, 77%, 50%)',
  pip: 'hsl(var(--destructive))',
  pip_milestone: 'hsl(var(--destructive))',
  stalled_kpi: 'hsl(24, 95%, 53%)',
  pending_kra: 'hsl(var(--primary))',
};

export function IssuesByTypeChart({ summary }: IssuesByTypeChartProps) {
  const data = Object.entries(summary.byType)
    .filter(([, count]) => count > 0)
    .map(([type, count]) => ({
      name: ISSUE_TYPE_LABELS[type as IssueType],
      value: count,
      type: type as IssueType,
    }));

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Issues by Type</CardTitle>
          <CardDescription>Distribution of issue categories</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[200px]">
          <p className="text-muted-foreground">No issues to display</p>
        </CardContent>
      </Card>
    );
  }

  const chartConfig = Object.fromEntries(
    Object.entries(ISSUE_TYPE_LABELS).map(([key, label]) => [
      key,
      { label, color: CHART_COLORS[key as IssueType] },
    ])
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Issues by Type</CardTitle>
        <CardDescription>Distribution of issue categories</CardDescription>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[250px]">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={data}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                paddingAngle={2}
                dataKey="value"
                nameKey="name"
                label={({ name, percent }) => 
                  `${name} (${(percent * 100).toFixed(0)}%)`
                }
                labelLine={false}
              >
                {data.map((entry) => (
                  <Cell 
                    key={`cell-${entry.type}`} 
                    fill={CHART_COLORS[entry.type]}
                  />
                ))}
              </Pie>
              <ChartTooltip content={<ChartTooltipContent />} />
            </PieChart>
          </ResponsiveContainer>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
