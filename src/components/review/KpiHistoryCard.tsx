import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, ResponsiveContainer, YAxis } from 'recharts';
import { History, TrendingUp, TrendingDown, Minus, ExternalLink } from 'lucide-react';
import type { KPI, ReviewSubmission } from '@/hooks/useKpis';
import {
  useCanonicalVariantPairs,
  matchesCanonicalKpi,
} from '@/lib/canonicalRelatedKpis';

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
  // Canonical-aware sibling resolution: includes alias variants of the same
  // KPI under their original (renamed) text. Falls back to strict equality
  // when the KPI isn't in the standardization registry. See POLICY §88I.
  const { data: variantPairs = [] } = useCanonicalVariantPairs(kpi);

  const monthlyData = useMemo(() => {
    // Find related KPIs (canonical + every alias) for this employee,
    // excluding the current row.
    const relatedKpis = allKpis.filter(
      k => k.id !== kpi.id && matchesCanonicalKpi(k, kpi, variantPairs),
    );

    const submissionMap = new Map(submissions.map(s => [s.kpi_id, s]));

    return relatedKpis
      .map(k => {
        const sub = submissionMap.get(k.id);
        const isNa = sub?.is_na === true;
        return {
          month: k.review_period || 'N/A',
          year: k.review_year,
          target: k.target_value ?? 0,
          achieved: isNa ? 0 : (sub?.achieved_value ?? 0),
          score: isNa ? 0 : ((k.status === 'approved' ? sub?.final_score : null) ?? sub?.management_score ?? sub?.auditor_score ?? sub?.manager_score ?? sub?.self_score ?? 0),
          status: k.status || 'kra_set',
          isNa,
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
  }, [kpi, allKpis, submissions, maxMonths, variantPairs]);

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

  // Prepare chart data (reversed for chronological order, exclude N/A)
  const chartData = [...monthlyData].reverse().filter(d => !d.isNa);

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
              className="flex items-center justify-between py-1 sm:py-1.5 px-1.5 sm:px-2 rounded bg-muted/30"
            >
              <span className="font-medium w-12 sm:w-16 text-[10px] sm:text-xs">
                {entry.month?.slice(0, 3)}-{String(entry.year).slice(-2)}
              </span>
              <span className="text-muted-foreground text-[10px] sm:text-xs">
                {entry.isNa ? (
                  <span className="text-amber-600 dark:text-amber-400 font-medium">N/A</span>
                ) : (
                  <>{entry.achieved}/{entry.target}</>
                )}
              </span>
              <Badge variant="outline" className="text-[10px] sm:text-xs px-1 sm:px-1.5">
                {entry.isNa ? 'N/A' : (entry.score != null ? entry.score : '-')}
              </Badge>
              <span className="text-muted-foreground uppercase text-[10px] w-10 sm:w-16 text-right truncate hidden sm:inline">
                {(entry.status || '').replace(/_/g, ' ')}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
