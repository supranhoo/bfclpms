import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getCycleLabel } from '@/lib/frequencyUtils';
import { Clock, Building2, Users, User } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

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
  const scope = kpi.org_level_scope || 'employee';

  const { data: managerName } = useQuery({
    queryKey: ['kpi-reporting-manager', kpi.employee_id],
    queryFn: async () => {
      const { data: emp } = await supabase
        .from('profiles')
        .select('reporting_manager_id')
        .eq('id', kpi.employee_id)
        .single();
      if (!emp?.reporting_manager_id) return null;
      const { data: mgr } = await supabase
        .from('profiles')
        .select('full_name')
        .eq('id', emp.reporting_manager_id)
        .single();
      return mgr?.full_name || null;
    },
    staleTime: 5 * 60 * 1000,
  });

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
          
          {kpi.frequency === 'Bi-Monthly' && (
            <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-400">
              Bi-Monthly: {getCycleLabel('Bi-Monthly', selectedPeriod, selectedYear, kpi.frequency_cycle_start)}
            </Badge>
          )}
          {kpi.frequency === 'Quarterly' && (
            <Badge variant="outline" className="text-xs border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-400">
              Quarterly: {getCycleLabel('Quarterly', selectedPeriod, selectedYear, kpi.frequency_cycle_start)}
            </Badge>
          )}
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

      {/* Reporting Manager */}
      {managerName && (
        <div className="text-xs text-muted-foreground text-right -mt-1 mb-2">
          👤 Reporting Manager: {managerName}
        </div>
      )}

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
