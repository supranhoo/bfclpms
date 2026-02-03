import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { History, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import type { KPI, ReviewSubmission } from '@/hooks/useKpis';

const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

interface KpiHistoryCardProps {
  kpi: KPI;
  allKpis: KPI[];
  submissions: ReviewSubmission[];
  maxMonths?: number;
  onViewFullHistory?: () => void;
}

export function KpiHistoryCard({
  kpi,
  allKpis,
  submissions,
  maxMonths = 6,
  onViewFullHistory,
}: KpiHistoryCardProps) {
  const monthlyData = useMemo(() => {
    // Find related KPIs with same name for this employee (excluding current)
    const relatedKpis = allKpis.filter(
      k =>
        k.employee_id === kpi.employee_id &&
        k.kpi_name === kpi.kpi_name &&
        k.kra_name === kpi.kra_name &&
        k.id !== kpi.id
    );

    const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

    return relatedKpis
      .map(k => {
        const sub = submissionMap.get(k.id);
        return {
          month: k.review_period || 'N/A',
          year: k.review_year,
          target: k.target_value || 0,
          achieved: sub?.achieved_value || 0,
          score: sub?.final_score || sub?.manager_score || sub?.self_score || 0,
          status: k.status || 'kra_set',
        };
      })
      .sort((a, b) => {
        // Sort by year desc, then month desc
        if ((a.year || 0) !== (b.year || 0)) return (b.year || 0) - (a.year || 0);
        const [monthA] = (a.month || '').split('-');
        const [monthB] = (b.month || '').split('-');
        return monthOrder.indexOf(monthB) - monthOrder.indexOf(monthA);
      })
      .slice(0, maxMonths);
  }, [kpi, allKpis, submissions, maxMonths]);

  // Calculate trend direction
  const trend = useMemo(() => {
    if (monthlyData.length < 2) return 'neutral';
    const recent = monthlyData[0]?.score || 0;
    const previous = monthlyData[1]?.score || 0;
    if (recent > previous) return 'up';
    if (recent < previous) return 'down';
    return 'neutral';
  }, [monthlyData]);

  if (monthlyData.length === 0) {
    return null; // No history to show
  }

  const TrendIcon = trend === 'up' ? TrendingUp : trend === 'down' ? TrendingDown : Minus;
  const trendColor =
    trend === 'up' ? 'text-green-500' : trend === 'down' ? 'text-red-500' : 'text-muted-foreground';

  // Prepare chart data (reversed for chronological order)
  const chartData = [...monthlyData].reverse();

  return (
    <Card className="border-dashed">
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-sm flex items-center gap-2">
          <History className="h-4 w-4 text-muted-foreground" />
          KPI History
          <TrendIcon className={`h-4 w-4 ${trendColor}`} />
        </CardTitle>
        {onViewFullHistory && (
          <Button variant="ghost" size="sm" onClick={onViewFullHistory} className="h-7 text-xs">
            View All
            <ExternalLink className="h-3 w-3 ml-1" />
          </Button>
        )}
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        {/* Mini Sparkline */}
        <div className="h-10">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <YAxis hide domain={[0, 5]} />
              <Line
                type="monotone"
                dataKey="score"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Compact History Table */}
        <div className="space-y-1 text-xs">
          {monthlyData.map((entry, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between py-1.5 px-2 rounded bg-muted/30"
            >
              <span className="font-medium w-16">
                {entry.month?.slice(0, 3)}-{String(entry.year).slice(-2)}
              </span>
              <span className="text-muted-foreground">
                {entry.achieved}/{entry.target}
              </span>
              <Badge variant="outline" className="text-xs px-1.5">
                {entry.score || '-'}
              </Badge>
              <span className="text-muted-foreground uppercase text-[10px] w-16 text-right truncate">
                {(entry.status || '').replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
