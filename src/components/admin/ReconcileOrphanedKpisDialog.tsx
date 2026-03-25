import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, RotateCcw, Zap } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getStageLabel } from '@/hooks/useWorkflowConfig';

interface ReconcileAffectedItem {
  kpi_id: string;
  employee_name: string;
  employee_id: string;
  kpi_name: string;
  kra_name: string;
  old_status: string;
  new_status: string;
  reason?: string;
  review_period: string | null;
  review_year: number | null;
}

interface ReconcileResult {
  count: number;
  dry_run: boolean;
  affected: ReconcileAffectedItem[];
}

interface ReconcileOrphanedKpisDialogProps {
  periodMode: 'global' | 'specific';
  selectedMonth: string;
  selectedYear: number;
}

const REASON_CONFIG: Record<string, { label: string; description: string; color: string; icon: typeof AlertTriangle }> = {
  missing_stage_orphan: {
    label: 'Orphaned Stage',
    description: 'Status no longer exists in workflow',
    color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
    icon: AlertTriangle,
  },
  terminal_stage_completed: {
    label: 'Terminal Completed',
    description: 'Final stage reviewed but not finalized',
    color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    icon: CheckCircle2,
  },
  terminal_stage_unreviewed: {
    label: 'Terminal Unreviewed',
    description: 'At final stage without reviewer score',
    color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
    icon: RotateCcw,
  },
  review_stage_mismatch: {
    label: 'Stage Mismatch',
    description: 'Review data exists but status is behind',
    color: 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400',
    icon: Zap,
  },
  current_stage_scored_not_forwarded: {
    label: 'Scored Not Forwarded',
    description: 'Score exists at current stage but KPI was not advanced',
    color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
    icon: ArrowRight,
  },
};

export default function ReconcileOrphanedKpisDialog({
  periodMode,
  selectedMonth,
  selectedYear,
}: ReconcileOrphanedKpisDialogProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<ReconcileResult | null>(null);
  const [executed, setExecuted] = useState(false);

  const reconcileMutation = useMutation({
    mutationFn: async ({ dryRun }: { dryRun: boolean }) => {
      const params: Record<string, unknown> = { p_dry_run: dryRun };
      if (periodMode === 'specific') {
        params.p_review_period = selectedMonth;
        params.p_review_year = selectedYear;
      }
      const { data, error } = await supabase.rpc(
        'reconcile_workflow_statuses' as any,
        params
      ) as { data: ReconcileResult | null; error: any };
      if (error) throw error;
      return data as ReconcileResult;
    },
  });

  const handleOpenDryRun = async () => {
    setDryRunResult(null);
    setExecuted(false);
    setDialogOpen(true);
    try {
      const result = await reconcileMutation.mutateAsync({ dryRun: true });
      setDryRunResult(result);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to scan for workflow status issues.',
        variant: 'destructive',
      });
      setDialogOpen(false);
    }
  };

  const handleExecute = async () => {
    try {
      const result = await reconcileMutation.mutateAsync({ dryRun: false });
      setDryRunResult(result);
      setExecuted(true);
      const approvedCount = result.affected.filter(a => a.new_status === 'approved').length;
      const rerouted = result.count - approvedCount;
      toast({
        title: 'Reconciliation complete',
        description: `${result.count} KPI(s) reconciled${approvedCount > 0 ? ` (${approvedCount} approved` : ''}${rerouted > 0 ? `, ${rerouted} rerouted)` : approvedCount > 0 ? ')' : ''}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['kpis'] });
      queryClient.invalidateQueries({ queryKey: ['employee-workflow'] });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err?.message || 'Failed to reconcile workflow statuses.',
        variant: 'destructive',
      });
    }
  };

  const scopeLabel = periodMode === 'specific'
    ? `${selectedMonth} ${selectedYear}`
    : 'All Periods';

  const getReasonBadge = (reason?: string) => {
    const config = reason ? REASON_CONFIG[reason] : null;
    if (!config) return null;
    const Icon = config.icon;
    return (
      <Badge variant="outline" className={`text-[10px] gap-0.5 border-0 ${config.color}`}>
        <Icon className="h-2.5 w-2.5" />
        {config.label}
      </Badge>
    );
  };

  return (
    <>
      <Button variant="outline" onClick={handleOpenDryRun} disabled={reconcileMutation.isPending}>
        <RefreshCw className={`h-4 w-4 mr-2 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
        Reconcile Workflow Statuses
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setDryRunResult(null); setExecuted(false); } }}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {executed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <Zap className="h-5 w-5 text-amber-500" />
              )}
              {executed ? 'Reconciliation Complete' : 'Workflow Status Reconciliation'}
            </DialogTitle>
            <DialogDescription>
              {executed
                ? `${dryRunResult?.count || 0} KPI(s) were reconciled.`
                : `Scanning for KPIs with orphaned statuses or stuck at terminal stages. Scope: ${scopeLabel}`
              }
            </DialogDescription>
          </DialogHeader>

          {reconcileMutation.isPending && !dryRunResult && (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">Scanning...</span>
            </div>
          )}

          {dryRunResult && dryRunResult.count === 0 && (
            <div className="text-center py-8">
              <CheckCircle2 className="h-10 w-10 text-green-600 mx-auto mb-2" />
              <p className="text-muted-foreground">No issues found. All workflow statuses are valid.</p>
            </div>
          )}

          {dryRunResult && dryRunResult.count > 0 && (
            <div className="space-y-3">
              {/* Summary badges */}
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="secondary">{dryRunResult.count} KPI(s)</Badge>
                {(() => {
                  const orphaned = dryRunResult.affected.filter(a => a.reason === 'missing_stage_orphan').length;
                  const completed = dryRunResult.affected.filter(a => a.reason === 'terminal_stage_completed').length;
                  const unreviewed = dryRunResult.affected.filter(a => a.reason === 'terminal_stage_unreviewed').length;
                  const mismatch = dryRunResult.affected.filter(a => a.reason === 'review_stage_mismatch').length;
                  return (
                    <>
                      {orphaned > 0 && <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20">{orphaned} orphaned</Badge>}
                      {completed > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20">{completed} terminal→approved</Badge>}
                      {unreviewed > 0 && <Badge variant="outline" className="text-xs bg-blue-50 dark:bg-blue-900/20">{unreviewed} terminal→reopened</Badge>}
                  {mismatch > 0 && <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20">{mismatch} stage mismatch</Badge>}
                      {(() => {
                        const notForwarded = dryRunResult.affected.filter(a => a.reason === 'current_stage_scored_not_forwarded').length;
                        return notForwarded > 0 ? <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-900/20">{notForwarded} scored not forwarded</Badge> : null;
                      })()}
                    </>
                  );
                })()}
              </div>

              <div className="border rounded-md max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>→</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dryRunResult.affected.map((item) => (
                      <TableRow key={item.kpi_id}>
                        <TableCell className="font-medium text-sm">{item.employee_name}</TableCell>
                        <TableCell className="text-sm">
                          <div>{item.kpi_name}</div>
                          <div className="text-xs text-muted-foreground">{item.kra_name}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {getStageLabel(item.old_status)}
                          </Badge>
                        </TableCell>
                        <TableCell><ArrowRight className="h-3.5 w-3.5 text-muted-foreground" /></TableCell>
                        <TableCell>
                          {item.new_status === 'approved' ? (
                            <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300 text-xs">
                              Approved
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0">
                              {getStageLabel(item.new_status)}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>{getReasonBadge(item.reason)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}

          <DialogFooter>
            {!executed && dryRunResult && dryRunResult.count > 0 && (
              <Button
                onClick={handleExecute}
                disabled={reconcileMutation.isPending}
                className="gap-2"
              >
                {reconcileMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm & Reconcile {dryRunResult.count} KPI(s)
              </Button>
            )}
            <Button variant="outline" onClick={() => { setDialogOpen(false); setDryRunResult(null); setExecuted(false); }}>
              {executed ? 'Close' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
