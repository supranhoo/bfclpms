import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getCycleLabel } from '@/lib/frequencyUtils';
import { Clock, Building2, Users, User, Lock, Settings, ClipboardEdit, Undo2, Trash2 } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';
import { useWorkflowSetting } from '@/hooks/useWorkflowSettings';
import { useFrequencyConfig } from '@/hooks/useFrequencyConfig';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { AdminKpiEditDialog } from '@/components/admin/AdminKpiEditDialog';
import { AdminDataEntryDialog } from '@/components/admin/AdminDataEntryDialog';
import { AdminStatusStepBackDialog } from '@/components/admin/AdminStatusStepBackDialog';
import { getPreviousStatus } from '@/hooks/useAdminDataEntry';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { useDashboardKraPermissions } from '@/hooks/useDashboardKraPermissions';
import { useAdminDeleteKpi } from '@/hooks/useKpis';
import {
  useCanonicalVariantPairs,
  canonicalPair,
} from '@/lib/canonicalRelatedKpis';

interface KpiHeaderSectionProps {
  kpi: KPI;
  selectedPeriod: string;
  selectedYear: number;
  onOpenTimeline?: () => void;
  orgKpiEnteredByName?: string | null;
  orgKpiDataOwnerNames?: string[];
  employeeId?: string;
  /** Period-resolved workflow stages, when known by the parent. POLICY §117. */
  workflowStages?: string[];
}

export function KpiHeaderSection({ kpi, selectedPeriod, selectedYear, onOpenTimeline, orgKpiEnteredByName, orgKpiDataOwnerNames, employeeId, workflowStages }: KpiHeaderSectionProps) {
  const { role } = useAuth();
  const isAdmin = role === 'admin';
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [dataEntryDialogOpen, setDataEntryDialogOpen] = useState(false);
  const [stepBackDialogOpen, setStepBackDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const { canDelete: canDeleteKra } = useDashboardKraPermissions();
  const deleteKpi = useAdminDeleteKpi();

  // Phase 5c (POLICY §88I): when this KPI is registered in the canonical
  // registry, prefer the canonical KRA/KPI text over the literal columns on
  // the row. This guarantees admin renames in /admin/kpi-standardization
  // are visible immediately even if the row's text columns lag behind
  // (e.g. autolink stamped the row before propagation, or propagation
  // hasn't run yet for a freshly inserted row).
  const { data: variantPairs = [] } = useCanonicalVariantPairs(kpi);
  const canonical = canonicalPair(variantPairs);
  const displayKra = canonical?.kra_name ?? kpi.kra_name;
  const displayKpi = canonical?.kpi_name ?? kpi.kpi_name;

  const categoryName = kpi.kra_categories?.name || 'Uncategorized';
  const categoryColor = kpi.kra_categories?.color || '#6B7280';
  const status = kpi.status || 'kra_set';
  const weightage = kpi.weightage || 0;
  const scope = kpi.org_level_scope || 'employee';
  
  const { config: freqConfig } = useFrequencyConfig(kpi.frequency);
  const govPerms = useReviewPeriodPermissions(selectedPeriod, selectedYear);
  const hasRestrictions = !govPerms.isLoading && (govPerms.view_only || !govPerms.edit_kpi || !govPerms.edit_scores);

  const { data: showDataOwnerSetting } = useWorkflowSetting('show_data_owner_to_employees');
  const showDataOwnerToEmployees = isAdmin || (showDataOwnerSetting?.setting_value !== false && showDataOwnerSetting?.setting_value !== 'false');

  const { data: employeeProfile } = useQuery({
    queryKey: ['kpi-employee-profile', kpi.employee_id],
    queryFn: async () => {
      const { data: emp } = await supabase
        .from('profiles')
        .select('full_name, employee_code, reporting_manager_id')
        .eq('id', kpi.employee_id)
        .single();
      if (!emp) return null;
      let managerName: string | null = null;
      if (emp.reporting_manager_id) {
        const { data: mgr } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', emp.reporting_manager_id)
          .single();
        managerName = mgr?.full_name || null;
      }
      return {
        full_name: emp.full_name,
        employee_code: emp.employee_code,
        managerName,
      };
    },
    staleTime: 5 * 60 * 1000,
  });

  return (
    <>
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
          
          {hasRestrictions && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs border-destructive/50 text-destructive gap-1">
                  <Lock className="h-3 w-3" />
                  {govPerms.view_only ? 'View Only' : 'Restricted'}
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Governance lock active for this period{govPerms.periodStage ? ` (${govPerms.periodStage.replace(/_/g, ' ')})` : ''}</p>
              </TooltipContent>
            </Tooltip>
          )}

          {/* Admin override indicator: closed period, admin still allowed to edit (audit-logged). */}
          {!hasRestrictions && isAdmin && govPerms.periodStage === 'closed' && (
            <Tooltip>
              <TooltipTrigger>
                <Badge variant="outline" className="text-xs border-amber-400 text-amber-700 dark:text-amber-300 gap-1">
                  <Lock className="h-3 w-3" />
                  Closed — Admin Override
                </Badge>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  This period's stage is Closed. As Admin you may still edit scores; every change is recorded in the audit log. To reopen for non-admin users, Step Back the period stage in Review Period Governance.
                </p>
              </TooltipContent>
            </Tooltip>
          )}
          
          {kpi.frequency === 'Bi-Monthly' && (
            <Badge variant="outline" className="text-xs border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-400">
              Bi-Monthly: {getCycleLabel('Bi-Monthly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)}
            </Badge>
          )}
          {kpi.frequency === 'Quarterly' && (
            <Badge variant="outline" className="text-xs border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-400">
              Quarterly: {getCycleLabel('Quarterly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)}
            </Badge>
          )}
          {kpi.frequency === 'Half-Yearly' && (
            <Badge variant="outline" className="text-xs border-amber-300 text-amber-700 dark:border-amber-600 dark:text-amber-400">
              Half-Yearly: {getCycleLabel('Half-Yearly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)}
            </Badge>
          )}
          {kpi.frequency === 'Yearly' && (
            <Badge variant="outline" className="text-xs border-rose-300 text-rose-700 dark:border-rose-600 dark:text-rose-400">
              Yearly: {getCycleLabel('Yearly', selectedPeriod, selectedYear, kpi.frequency_cycle_start, freqConfig)}
            </Badge>
          )}
          {kpi.frequency === 'Weekly' && (
            <Badge variant="outline" className="text-xs border-sky-300 text-sky-700 dark:border-sky-600 dark:text-sky-400">
              Weekly
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

      {/* Employee & Reporting Manager */}
      {(employeeProfile?.full_name || employeeProfile?.managerName) && (
        <div className="text-xs text-muted-foreground text-right -mt-1 mb-2">
          {employeeProfile?.full_name && (
            <span>👤 Employee: {employeeProfile.full_name}</span>
          )}
          {employeeProfile?.full_name && employeeProfile?.managerName && (
            <span className="mx-1.5">|</span>
          )}
          {employeeProfile?.managerName && (
            <span>👤 Reporting Manager: {employeeProfile.managerName}</span>
          )}
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
          {showDataOwnerToEmployees && orgKpiDataOwnerNames && orgKpiDataOwnerNames.length > 0 && (
            <Badge variant="outline" className="text-xs">
              Data Owner: {orgKpiDataOwnerNames.join(', ')}
            </Badge>
          )}
          {showDataOwnerToEmployees && orgKpiEnteredByName && kpi.status !== 'kra_set' && (
            <Badge variant="outline" className="text-xs">
              Data entered by: {orgKpiEnteredByName}
            </Badge>
          )}
        </div>
      )}

      {/* KRA & KPI Names - Full text, no truncation */}
      <h3 className="font-semibold text-sm sm:text-lg text-primary leading-tight whitespace-pre-wrap">
        {renderBoldKpiText(displayKra)}
      </h3>
      <p className="text-xs sm:text-sm text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap">
        {renderBoldKpiText(displayKpi)}
      </p>

      {(isAdmin || canDeleteKra) && (
        <div className="flex justify-end gap-1.5 mt-2">
          {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditDialogOpen(true)}
            className="gap-1 h-6 sm:h-7 px-2 text-xs border-primary/30 text-primary"
          >
            <Settings className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Admin KPI Editor</span>
          </Button>
          )}
          {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDataEntryDialogOpen(true)}
            className="gap-1 h-6 sm:h-7 px-2 text-xs border-primary/30 text-primary"
          >
            <ClipboardEdit className="h-3 w-3 sm:h-4 sm:w-4" />
            <span className="hidden sm:inline">Admin Data Entry</span>
          </Button>
          )}
          {isAdmin && getPreviousStatus(status) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStepBackDialogOpen(true)}
              className="gap-1 h-6 sm:h-7 px-2 text-xs border-destructive/30 text-destructive"
            >
              <Undo2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Step Back</span>
            </Button>
          )}
          {(isAdmin || canDeleteKra) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setDeleteDialogOpen(true)}
              className="gap-1 h-6 sm:h-7 px-2 text-xs border-destructive/30 text-destructive"
            >
              <Trash2 className="h-3 w-3 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">Delete KRA</span>
            </Button>
          )}
        </div>
      )}
    </div>

    {/* Admin Dialogs */}
    {isAdmin && (
      <>
        <AdminKpiEditDialog
          isOpen={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          kpi={kpi}
        />
        <AdminDataEntryDialog
          isOpen={dataEntryDialogOpen}
          onClose={() => setDataEntryDialogOpen(false)}
          kpi={kpi}
          employeeId={employeeId || kpi.employee_id}
          employeeName={employeeProfile?.full_name || 'Employee'}
          employeeCode={employeeProfile?.employee_code || undefined}
        />
        <AdminStatusStepBackDialog
          isOpen={stepBackDialogOpen}
          onClose={() => setStepBackDialogOpen(false)}
          kpiId={kpi.id}
          kpiName={kpi.kpi_name}
          kraName={kpi.kra_name}
          employeeId={employeeId || kpi.employee_id}
          employeeName={employeeProfile?.full_name || 'Employee'}
          currentStatus={status}
          reviewPeriod={kpi.review_period ?? undefined}
          reviewYear={kpi.review_year ?? undefined}
          workflowStages={workflowStages}
        />
      </>
    )}
    {(isAdmin || canDeleteKra) && (
      <ConfirmDestructiveDialog
        open={deleteDialogOpen}
        onCancel={() => setDeleteDialogOpen(false)}
        onConfirm={() => {
          deleteKpi.mutate(kpi.id, {
            onSuccess: () => setDeleteDialogOpen(false),
          });
        }}
        title="Delete this KRA?"
        description={`This will permanently delete "${displayKra} — ${displayKpi}" for ${employeeProfile?.full_name || 'this employee'}, along with its review submissions and history. This cannot be undone.`}
        confirmLabel="Delete KRA"
        isLoading={deleteKpi.isPending}
      />
    )}
    </>
  );
}
