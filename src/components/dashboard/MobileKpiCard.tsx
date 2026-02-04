import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, BarChart3 } from 'lucide-react';
import { KPI } from '@/hooks/useKpis';

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
  ratingColors: Record<string, string>;
  onViewLogic: (kpi: KPI) => void;
  onViewTracker: (kpi: KPI) => void;
}

export function MobileKpiCard({
  kpi,
  submission,
  statusColors,
  statusLabels,
  ratingColors,
  onViewLogic,
  onViewTracker,
}: MobileKpiCardProps) {
  const rating = submission?.final_rating || submission?.self_rating;
  const score = submission?.final_score || submission?.self_score;

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
        <Badge className={`text-xs ${statusColors[kpi.status || 'kra_set']}`}>
          {statusLabels[kpi.status || 'kra_set']}
        </Badge>
      </div>

      {/* KRA/KPI names */}
      <p className="font-medium text-sm mb-1 line-clamp-1">{kpi.kra_name}</p>
      <p className="text-xs text-muted-foreground mb-3 line-clamp-2">{kpi.kpi_name}</p>

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
              {rating ? (
                <Badge
                  style={{ backgroundColor: ratingColors[rating] }}
                  className="text-white text-xs px-1.5 py-0"
                >
                  {score?.toFixed(1) || rating}
                </Badge>
              ) : (
                '-'
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
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
