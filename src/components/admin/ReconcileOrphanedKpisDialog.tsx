import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
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

interface ReconcileResult {
  count: number;
  dry_run: boolean;
  affected: Array<{
    kpi_id: string;
    employee_name: string;
    employee_id: string;
    kpi_name: string;
    kra_name: string;
    old_status: string;
    new_status: string;
    review_period: string | null;
    review_year: number | null;
  }>;
}

interface ReconcileOrphanedKpisDialogProps {
  periodMode: 'global' | 'specific';
  selectedMonth: string;
  selectedYear: number;
}

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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to scan for orphaned KPIs.',
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
    } catch {
      toast({
        title: 'Error',
        description: 'Failed to reconcile orphaned KPIs.',
        variant: 'destructive',
      });
    }
  };

  const scopeLabel = periodMode === 'specific'
    ? `${selectedMonth} ${selectedYear}`
    : 'All Periods';

  return (
    <>
      <Button variant="outline" onClick={handleOpenDryRun} disabled={reconcileMutation.isPending}>
        <RefreshCw className={`h-4 w-4 mr-2 ${reconcileMutation.isPending ? 'animate-spin' : ''}`} />
        Reconcile Orphaned KPIs
      </Button>

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setDryRunResult(null); setExecuted(false); } }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {executed ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              )}
              {executed ? 'Reconciliation Complete' : 'Reconcile Orphaned KPIs'}
            </DialogTitle>
            <DialogDescription>
              {executed
                ? `${dryRunResult?.count || 0} KPI(s) were moved to Approved status.`
                : `Scanning for KPIs stuck in statuses that no longer exist in their assigned workflow. Scope: ${scopeLabel}`
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
              <p className="text-muted-foreground">No orphaned KPIs found. All statuses are valid.</p>
            </div>
          )}

          {dryRunResult && dryRunResult.count > 0 && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge variant="secondary">{dryRunResult.count} KPI(s)</Badge>
                <span className="text-sm text-muted-foreground">
                  will be reconciled to their correct workflow stage
                </span>
              </div>

              <div className="border rounded-md max-h-[40vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Current Status</TableHead>
                      <TableHead>→</TableHead>
                      <TableHead>New Status</TableHead>
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
                        <TableCell className="text-muted-foreground">→</TableCell>
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
