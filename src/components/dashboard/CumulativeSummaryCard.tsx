import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { KpiTrendIndicator } from './KpiTrendIndicator';
import { CalendarRange, Target, CheckCircle, Clock } from 'lucide-react';
import type { TrendDirection } from '@/lib/cumulativeScoring';
import type { PeriodSelection } from '@/components/ui/ReviewPeriodSelectorEnhanced';

interface CumulativeSummaryCardProps {
  periodSelection: PeriodSelection;
  avgScore: number | null;
  trend: TrendDirection;
  completedCount: number;
  totalCount: number;
  pendingCount: number;
}

export function CumulativeSummaryCard({
  periodSelection,
  avgScore,
  trend,
  completedCount,
  totalCount,
  pendingCount,
}: CumulativeSummaryCardProps) {
  const { periodRanges, mode } = periodSelection;
  
  const modeLabels: Record<string, string> = {
    ytd: 'Year-to-Date',
    qtd: 'Quarter-to-Date',
    custom: 'Custom Range',
    single: 'Monthly',
  };

  // Format period range display
  const formatPeriodRange = () => {
    if (periodRanges.length === 0) return '';
    if (periodRanges.length === 1) {
      const p = periodRanges[0];
      return `${p.month.substring(0, 3)} ${p.year}`;
    }
    const first = periodRanges[0];
    const last = periodRanges[periodRanges.length - 1];
    if (first.year === last.year) {
      return `${first.month.substring(0, 3)} - ${last.month.substring(0, 3)} ${first.year}`;
    }
    return `${first.month.substring(0, 3)} ${first.year} - ${last.month.substring(0, 3)} ${last.year}`;
  };

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" />
          {modeLabels[mode]} Performance Summary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Period Range */}
        <div className="text-xs text-muted-foreground">
          {formatPeriodRange()} ({periodRanges.length} {periodRanges.length === 1 ? 'month' : 'months'})
        </div>

        {/* Main Stats Grid */}
        <div className="grid grid-cols-2 gap-4">
          {/* Average Score */}
          <div className="space-y-1">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Target className="h-3 w-3" />
              Avg Score
            </div>
            <div className="flex items-center gap-2">
              <span className="text-2xl font-bold">
                {avgScore !== null ? avgScore.toFixed(1) : '-'}
              </span>
              <span className="text-sm text-muted-foreground">/5</span>
            </div>
          </div>

          {/* Trend */}
          <div className="space-y-1">
            <div className="text-xs text-muted-foreground">Trend</div>
            <KpiTrendIndicator trend={trend} showLabel size="lg" />
          </div>
        </div>

        {/* Completion Stats */}
        <div className="grid grid-cols-2 gap-4 pt-2 border-t border-border/50">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-green-600 dark:text-green-400" />
            <div className="text-sm">
              <span className="font-medium">{completedCount}</span>
              <span className="text-muted-foreground">/{totalCount}</span>
              <span className="text-xs text-muted-foreground ml-1">Completed</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <div className="text-sm">
              <span className="font-medium">{pendingCount}</span>
              <span className="text-xs text-muted-foreground ml-1">Pending</span>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
