import { useState, useMemo, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Undo2, AlertTriangle } from 'lucide-react';
import { getStageLabel } from '@/hooks/useWorkflowConfig';
import {
  useAdminStatusStepBack,
  getPreviousStatus,
  computeStepBackTargets,
  getDataAwareDefaultTarget,
  getPreferredStepBackTarget,
} from '@/hooks/useAdminDataEntry';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';

type ReviewStatus = Database['public']['Enums']['review_status'];

interface AdminStatusStepBackDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpiId: string;
  kpiName: string;
  kraName: string;
  employeeId: string;
  employeeName: string;
  currentStatus: ReviewStatus;
  workflowStages?: string[];
  /**
   * KPI period — used so the workflow lookup resolves the template that actually
   * governed this KPI (not the current global template). Forwarded to
   * `get_employee_workflow(employee_uuid, p_review_period, p_review_year)`.
   */
  reviewPeriod?: string;
  reviewYear?: number;
}

export function AdminStatusStepBackDialog({
  isOpen,
  onClose,
  kpiId,
  kpiName,
  kraName,
  employeeId,
  employeeName,
  currentStatus,
  workflowStages: externalStages,
  reviewPeriod,
  reviewYear,
}: AdminStatusStepBackDialogProps) {
  const [reason, setReason] = useState('');
  const [fullReset, setFullReset] = useState(false);
  const [selectedTarget, setSelectedTarget] = useState<ReviewStatus | ''>('');
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);
  const stepBackMutation = useAdminStatusStepBack();

  // Fetch employee's actual workflow stages when dialog is open and no external stages provided.
  // Pass period args so the RPC walks its period-specific priority chain (POLICY §117).
  const { data: fetchedStages, isLoading: stagesLoading, isFetching: stagesFetching } = useQuery({
    queryKey: ['employee-workflow', employeeId, reviewPeriod ?? null, reviewYear ?? null],
    queryFn: async () => {
      const { data } = await supabase.rpc('get_employee_workflow', {
        employee_uuid: employeeId,
        p_review_period: reviewPeriod ?? undefined,
        p_review_year: reviewYear ?? undefined,
      });
      return (data as string[]) || undefined;
    },
    enabled: isOpen && !externalStages,
    staleTime: 5 * 60 * 1000,
  });

  // Fetch persisted scoring data for this KPI so step-back can always reach
  // any stage that actually has data (POLICY §117 — Step-Back Target Composition).
  const { data: dataBearingStages, isLoading: dataLoading, isFetching: dataFetching } = useQuery({
    queryKey: ['kpi-data-bearing-stages', kpiId],
    queryFn: async () => {
      const { data } = await supabase
        .from('review_submissions')
        .select('self_score, manager_score, skip_level_score, hr_pms_score, auditor_score, management_score')
        .eq('kpi_id', kpiId)
        .maybeSingle();
      if (!data) return [] as ReviewStatus[];
      const stages: ReviewStatus[] = [];
      if (data.self_score !== null) stages.push('self_review');
      if (data.manager_score !== null) stages.push('manager_check');
      if (data.skip_level_score !== null) stages.push('skip_level_check');
      if (data.hr_pms_score !== null) stages.push('hr_pms_review');
      if (data.auditor_score !== null) stages.push('audit');
      if (data.management_score !== null) stages.push('management_review');
      return stages;
    },
    enabled: isOpen,
    staleTime: 60 * 1000,
  });

  const workflowStages = externalStages || fetchedStages || undefined;
  const previousStatus = getPreviousStatus(currentStatus, workflowStages);

  const availableTargets = useMemo(
    () => computeStepBackTargets(currentStatus, workflowStages, dataBearingStages ?? []),
    [currentStatus, workflowStages, dataBearingStages]
  );

  // POLICY §117 — derive the canonical default ONLY from `availableTargets`
  // so the Select value can never disagree with its option list.
  const preferredDefault = useMemo<ReviewStatus | null>(
    () => getPreferredStepBackTarget(currentStatus, availableTargets, dataBearingStages ?? []),
    [currentStatus, availableTargets, dataBearingStages]
  );

  // Resolution must wait for BOTH the period-aware workflow lookup AND the
  // data-bearing stages query — otherwise the Select can briefly initialize
  // to a stale fallback (e.g. HR PMS) and stick due to user/cached state.
  const isResolving = (!externalStages && (stagesLoading || stagesFetching)) || dataLoading || dataFetching;

  // Reset any previously selected target when the dialog opens for a new KPI
  // or when the resolved option set changes underneath it.
  useEffect(() => {
    if (!isOpen) return;
    if (selectedTarget && !availableTargets.some(t => t.stage === selectedTarget)) {
      setSelectedTarget('');
    }
  }, [isOpen, kpiId, availableTargets, selectedTarget]);

  const effectiveTarget = fullReset
    ? 'kra_set'
    : ((selectedTarget && availableTargets.some(t => t.stage === selectedTarget))
        ? selectedTarget
        : (preferredDefault || 'kra_set')) as ReviewStatus;

  const handleSubmit = () => {
    if (!effectiveTarget || !reason.trim()) return;

    if (fullReset) {
      setShowFullResetConfirm(true);
      return;
    }

    executeStepBack();
  };

  const executeStepBack = () => {
    setShowFullResetConfirm(false);
    stepBackMutation.mutate(
      {
        kpi_id: kpiId,
        employee_id: employeeId,
        current_status: currentStatus,
        target_status: effectiveTarget,
        reason: reason.trim(),
        kpi_name: kpiName,
        full_reset: fullReset,
        revert_siblings: currentStatus === 'approved',
      },
      {
        onSuccess: () => {
          setReason('');
          setFullReset(false);
          setSelectedTarget('');
          onClose();
        },
      }
    );
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setReason('');
      setFullReset(false);
      setSelectedTarget('');
      onClose();
    }
  };

  return (
    <>
    <ConfirmDestructiveDialog
      open={showFullResetConfirm}
      onConfirm={executeStepBack}
      onCancel={() => setShowFullResetConfirm(false)}
      title="Confirm Full Data Reset"
      description="This will permanently delete ALL scores, remarks, evidence, and achieved values for this KPI. This action cannot be undone. Are you sure?"
      confirmLabel="Yes, Delete All Data"
      isLoading={stepBackMutation.isPending}
    />
    <Dialog open={isOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5" />
            Step Back KPI Status
          </DialogTitle>
          <DialogDescription>
            Move this KPI backward in the workflow. Select a target stage and provide a mandatory reason for the audit trail.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* KPI Info */}
          <div className="p-3 bg-muted rounded-md space-y-1">
            <div className="text-sm font-medium text-foreground">{kraName}</div>
            <div className="text-sm text-muted-foreground">{kpiName}</div>
            <div className="text-xs text-muted-foreground">Employee: {employeeName}</div>
          </div>

          {/* Status Transition with target selector */}
          <div className="space-y-2">
            <label className="text-sm font-medium">Target Stage</label>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className="text-sm shrink-0">
                {getStageLabel(currentStatus)}
              </Badge>
              <ArrowLeft className="h-4 w-4 text-muted-foreground shrink-0" />
              {fullReset ? (
                <Badge variant="secondary" className="text-sm">
                  {getStageLabel('kra_set')} (Full Reset)
                </Badge>
              ) : isResolving ? (
                <Badge variant="outline" className="text-sm text-muted-foreground">
                  Resolving target stages…
                </Badge>
              ) : availableTargets.length > 1 ? (
                <Select
                  value={(selectedTarget && availableTargets.some(t => t.stage === selectedTarget))
                    ? selectedTarget
                    : (preferredDefault ?? '')}
                  onValueChange={(v) => setSelectedTarget(v as ReviewStatus)}
                  disabled={fullReset}
                >
                  <SelectTrigger className="w-[200px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {availableTargets.map(({ stage, historic }) => (
                      <SelectItem key={stage} value={stage}>
                        {getStageLabel(stage)}
                        {historic && (
                          <span className="ml-1 text-xs text-muted-foreground">(historic)</span>
                        )}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Badge variant="secondary" className="text-sm">
                  {preferredDefault
                    ? getStageLabel(preferredDefault)
                    : previousStatus
                    ? getStageLabel(previousStatus)
                    : '—'}
                </Badge>
              )}
            </div>
            {!isResolving && reviewPeriod && reviewYear && (
              <p className="text-[11px] text-muted-foreground">
                Workflow resolved for {reviewPeriod} {reviewYear}
                {availableTargets.some(t => t.historic) && ' · includes stages with recorded data'}
              </p>
            )}
          </div>

          {/* Full Reset checkbox */}
          <div className="flex items-start gap-2 p-3 border border-destructive/30 rounded-md bg-destructive/5">
            <Checkbox
              id="full-reset"
              checked={fullReset}
              onCheckedChange={(checked) => setFullReset(checked === true)}
            />
            <div className="grid gap-1 leading-none">
              <label htmlFor="full-reset" className="text-sm font-medium cursor-pointer flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
                Clear all review data (full reset)
              </label>
              <p className="text-xs text-muted-foreground">
                Deletes all scores, remarks, evidence, and achieved values. Resets KPI to KRA Set with a clean slate. Use for removing test data.
              </p>
            </div>
          </div>

          {/* Sibling info for multi-month KPIs */}
          {currentStatus === 'approved' && (
            <div className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              ℹ️ If this is a multi-month KPI (Quarterly, Bi-Monthly, etc.), all sibling months in the same cycle will also be reverted.
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <label className="text-sm font-medium">
              Reason for Step Back <span className="text-destructive">*</span>
            </label>
            <Textarea
              placeholder="Explain why this KPI needs to be moved back..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!reason.trim() || stepBackMutation.isPending}
            variant={fullReset ? 'destructive' : 'default'}
          >
            {stepBackMutation.isPending ? 'Processing...' : fullReset ? 'Confirm Full Reset' : 'Confirm Step Back'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  );
}
