import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { Clock, Building2, Users, User } from 'lucide-react';

interface KpiHeaderSectionProps {
  kpi: KPI;
  selectedPeriod: string;
  selectedYear: number;
  onOpenTimeline?: () => void;
  orgKpiEnteredByName?: string | null;
}

export function KpiHeaderSection({ kpi, selectedPeriod, selectedYear, onOpenTimeline, orgKpiEnteredByName }: KpiHeaderSectionProps) {
  const categoryName = kpi.kra_categories?.name || 'Uncategorized';
  const categoryColor = kpi.kra_categories?.color || '#6B7280';
  const status = kpi.status || 'kra_set';
  const weightage = kpi.weightage || 0;
  const scope = kpi.org_level_scope || 'organization';

  return (
    <div className="p-3 sm:p-4 bg-muted/30 rounded-lg border">
      {/* Badges Row */}
      <div className="flex flex-wrap items-center justify-between gap-1.5 sm:gap-2 mb-2 sm:mb-3">
        {/* Left: Category */}
        <Badge 
          style={{ backgroundColor: categoryColor }} 
          className="text-white text-xs"
        >
          {categoryName}
        </Badge>

        {/* Right: Status + Period + Weightage + Timeline */}
        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5">
          <Badge className={`${statusColors[status] || statusColors.kra_set} text-xs`}>
            {statusLabels[status] || 'KRA Set'}
          </Badge>
          <Badge variant="outline" className="text-xs">
            {selectedPeriod} {selectedYear}
          </Badge>
          <Badge variant="secondary" className="text-xs">
            {weightage}%
          </Badge>
          
          {onOpenTimeline && (
            <Button
              variant="outline"
              size="sm"
              onClick={onOpenTimeline}
              className="gap-1 h-6 sm:h-7 px-2 text-xs"
            >
              <Clock className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Timeline</span>
            </Button>
          )}
        </div>
      </div>

      {/* Org KPI Badge Row */}
      {kpi.is_org_level && (
        <div className="flex flex-wrap items-center gap-1.5 mb-2">
          <Badge variant="secondary" className="text-xs gap-1">
            {scope === 'organization' ? (
              <Building2 className="h-3 w-3" />
            ) : scope === 'department' ? (
              <Users className="h-3 w-3" />
            ) : (
              <User className="h-3 w-3" />
            )}
            Organization KPI — {scope.charAt(0).toUpperCase() + scope.slice(1)}
          </Badge>
          {orgKpiEnteredByName && (
            <Badge variant="outline" className="text-xs">
              Data entered by: {orgKpiEnteredByName}
            </Badge>
          )}
        </div>
      )}

      {/* KRA & KPI Names - Full text, no truncation */}
      <h3 className="font-semibold text-sm sm:text-lg text-primary leading-tight whitespace-pre-wrap">
        {renderBoldKpiText(kpi.kra_name)}
      </h3>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
        {renderBoldKpiText(kpi.kpi_name)}
      </p>
    </div>
  );
}
