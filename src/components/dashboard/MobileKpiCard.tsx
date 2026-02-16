import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, BarChart3, ClipboardEdit } from 'lucide-react';
import { KPI } from '@/hooks/useKpis';
import { getScoreBadgeClass } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

interface MobileKpiCardProps {
  kpi: KPI;
  submission?: {
    final_rating?: string | null;
    self_rating?: string | null;
    final_score?: number | null;
    self_score?: number | null;
    achieved_value?: number | null;
  };
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  score?: number | null;
  onViewLogic: (kpi: KPI) => void;
  onViewTracker: (kpi: KPI) => void;
  onReview?: (kpi: KPI) => void;
}

export function MobileKpiCard({
  kpi,
  submission,
  statusColors,
  statusLabels,
  score: scoreProp,
  onViewLogic,
  onViewTracker,
  onReview,
}: MobileKpiCardProps) {
  const score = scoreProp ?? submission?.final_score ?? submission?.self_score ?? null;

  return (
    <Card className="p-4">
      {/* Category pill + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: kpi.kra_categories?.color || 'hsl(var(--primary))' }}
          />
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {kpi.kra_categories?.name}
          </span>
        </div>
        <div className="flex items-center gap-1">
          {kpi.frequency === 'Bi-Monthly' && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-400">
              Bi-Monthly
            </Badge>
          )}
          {kpi.frequency === 'Quarterly' && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-400">
              Quarterly
            </Badge>
          )}
          <Badge className={`text-xs ${statusColors[kpi.status || 'kra_set']}`}>
            {statusLabels[kpi.status || 'kra_set']}
          </Badge>
        </div>
      </div>

      {/* KRA/KPI names */}
      <p className="font-medium text-sm mb-1 line-clamp-1 whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</p>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2 whitespace-pre-wrap">{renderBoldKpiText(kpi.kpi_name)}</p>

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block">Target</span>
            <p className="font-mono font-medium">{kpi.target_value ?? '-'}</p>
          </div>
          <div>
            <span className="text-muted-foreground block">Weight</span>
            <p className="font-medium">{kpi.weightage}%</p>
          </div>
          <div>
            <span className="text-muted-foreground block">Score</span>
            <p className="font-medium">
              {score != null ? (
                <Badge className={`${getScoreBadgeClass(score)} text-xs px-1.5 py-0`}>
                  {score.toFixed(1)}
                </Badge>
              ) : (
                '-'
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {onReview && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onReview(kpi)}
              title="Review KPI"
            >
              <ClipboardEdit className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onViewLogic(kpi)}
            title="View Rating Logic"
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onViewTracker(kpi)}
            title="View Tracker"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
