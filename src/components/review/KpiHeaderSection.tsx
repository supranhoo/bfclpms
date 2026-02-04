import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { normalizeKpiText } from '@/lib/textFormatting';
import { Clock } from 'lucide-react';

interface KpiHeaderSectionProps {
  kpi: KPI;
  selectedPeriod: string;
  selectedYear: number;
  onOpenTimeline?: () => void;
}

export function KpiHeaderSection({ kpi, selectedPeriod, selectedYear, onOpenTimeline }: KpiHeaderSectionProps) {
  const categoryName = kpi.kra_categories?.name || 'Uncategorized';
  const categoryColor = kpi.kra_categories?.color || '#6B7280';
  const status = kpi.status || 'kra_set';
  const weightage = kpi.weightage || 0;

  return (
    <div className="p-4 bg-muted/30 rounded-lg border">
      {/* Badges Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
        {/* Left: Category */}
        <Badge 
          style={{ backgroundColor: categoryColor }} 
          className="text-white"
        >
          {categoryName}
        </Badge>

        {/* Right: Status + Period + Weightage + Timeline */}
        <div className="flex flex-wrap items-center gap-2">
          <Badge className={statusColors[status] || statusColors.kra_set}>
            {statusLabels[status] || 'KRA Set'}
          </Badge>
          <Badge variant="outline">
            {selectedPeriod} {selectedYear}
          </Badge>
          <Badge variant="secondary">
            {weightage}% Weight
          </Badge>
          
          {onOpenTimeline && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTimeline}
              className="gap-1.5"
            >
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </Button>
          )}
        </div>
      </div>

      {/* KRA & KPI Names - Full text, no truncation */}
      <h3 className="font-semibold text-lg text-primary leading-tight whitespace-pre-wrap">
        {normalizeKpiText(kpi.kra_name)}
      </h3>
      <p className="text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
        {normalizeKpiText(kpi.kpi_name)}
      </p>
    </div>
  );
}
