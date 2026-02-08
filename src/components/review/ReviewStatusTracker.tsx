import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { MessageSquare } from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPI, KpiQuery } from '@/hooks/useKpis';

type ReviewStatus = 'kra_set' | 'self_review' | 'manager_check' | 'audit' | 'management_review' | 'approved';

interface ReviewStatusTrackerProps {
  kpis: KPI[];
  queries?: KpiQuery[];
  compact?: boolean;
}

const stages: { 
  key: ReviewStatus; 
  shortLabel: string; 
  colorClass: string;
}[] = [
  { key: 'kra_set', shortLabel: 'KRA', colorClass: 'bg-muted text-muted-foreground border-muted' },
  { key: 'self_review', shortLabel: 'Self', colorClass: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-blue-200 dark:border-blue-800' },
  { key: 'manager_check', shortLabel: 'Mgr', colorClass: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200 border-amber-200 dark:border-amber-800' },
  { key: 'audit', shortLabel: 'Audit', colorClass: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200 border-purple-200 dark:border-purple-800' },
  { key: 'management_review', shortLabel: 'Mgmt', colorClass: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800' },
  { key: 'approved', shortLabel: 'Done', colorClass: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-green-200 dark:border-green-800' },
];

export function ReviewStatusTracker({ kpis, queries = [], compact = false }: ReviewStatusTrackerProps) {
  // Calculate counts per status
  const statusCounts = useMemo(() => {
    const counts: Record<ReviewStatus, number> = {
      kra_set: 0,
      self_review: 0,
      manager_check: 0,
      audit: 0,
      management_review: 0,
      approved: 0,
    };
    
    kpis.forEach(k => {
      const status = k.status as ReviewStatus;
      if (status && status in counts) {
        counts[status]++;
      }
    });
    
    return counts;
  }, [kpis]);

  // Determine which stages have open queries
  // We group open queries by KPI status to show indicator on that stage
  const queriesByStage = useMemo(() => {
    const stageQueries: Record<string, number> = {};
    
    const openQueries = queries.filter(q => q.status === 'open');
    openQueries.forEach(query => {
      const kpi = kpis.find(k => k.id === query.kpi_id);
      if (kpi) {
        const stage = kpi.status || 'kra_set';
        stageQueries[stage] = (stageQueries[stage] || 0) + 1;
      }
    });
    
    return stageQueries;
  }, [queries, kpis]);

  // Total open queries
  const openQueryCount = queries.filter(q => q.status === 'open').length;

  // Calculate completion percentage
  const total = kpis.length;
  const approved = statusCounts.approved;
  const completionPercent = total > 0 ? (approved / total) * 100 : 0;

  if (total === 0) return null;

  return (
    <Card className={cn("shadow-sm", compact && "border-0 bg-muted/30")}>
      <CardContent className={cn("py-2 px-3", compact && "py-1.5 px-2")}>
        {!compact && (
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium text-muted-foreground">Review Progress</span>
            {openQueryCount > 0 && (
              <Badge variant="outline" className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700 text-[10px] px-1.5 py-0">
                <MessageSquare className="h-3 w-3 mr-1" />
                {openQueryCount} {openQueryCount === 1 ? 'query' : 'queries'}
              </Badge>
            )}
          </div>
        )}
        
        <div className={cn(
          "flex flex-wrap gap-1.5",
          !compact && "mb-1.5"
        )}>
          {stages.map(stage => {
            const count = statusCounts[stage.key];
            const hasQuery = (queriesByStage[stage.key] || 0) > 0;
            
            return (
              <Badge 
                key={stage.key} 
                variant="outline" 
                className={cn(
                  stage.colorClass, 
                  "text-[10px] px-1.5 py-0 relative font-medium",
                  compact && "text-[9px] px-1"
                )}
              >
                {stage.shortLabel}: {count}
                {hasQuery && (
                  <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-orange-500 dark:bg-orange-400" />
                )}
              </Badge>
            );
          })}
          
          {compact && openQueryCount > 0 && (
            <Badge 
              variant="outline" 
              className="text-orange-600 border-orange-300 dark:text-orange-400 dark:border-orange-700 text-[9px] px-1 py-0"
            >
              <MessageSquare className="h-2.5 w-2.5 mr-0.5" />
              {openQueryCount}
            </Badge>
          )}
        </div>
        
        <Progress value={completionPercent} className="h-1" />
      </CardContent>
    </Card>
  );
}
