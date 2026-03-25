import { useState, useMemo } from 'react';
import { useDistinctKpiPeriods } from '@/hooks/useKpis';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { RefreshCw, AlertTriangle, CheckCircle2, ArrowRight, Zap, Filter } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
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
import { getKpiSummaryText } from '@/lib/textFormatting';

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
  const [selectedKpiIds, setSelectedKpiIds] = useState<Set<string>>(new Set());
  const [filterPeriod, setFilterPeriod] = useState('all');

  // When filter changes, narrow selection to only visible KPIs
  const handleFilterChange = (value: string) => {
    setFilterPeriod(value);
    if (!dryRunResult) return;
    const filtered = value === 'all'
      ? dryRunResult.affected
      : dryRunResult.affected.filter(a => a.review_period && a.review_year && `${a.review_period} ${a.review_year}` === value);
    const filteredIds = new Set(filtered.map(a => a.kpi_id));
    setSelectedKpiIds(prev => {
      const next = new Set<string>();
      prev.forEach(id => { if (filteredIds.has(id)) next.add(id); });
      return next.size > 0 ? next : filteredIds;
    });
  };

  // Fetch all review periods from DB for complete dropdown
  const { data: allReviewPeriods } = useQuery({
    queryKey: ['review-periods-for-reconcile'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('review_periods')
        .select('period_name, review_year')
        .order('review_year', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: dialogOpen,
  });

  const MONTH_ORDER = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  // Count affected KPIs per period from dry-run results
  const affectedCountMap = useMemo(() => {
    const map = new Map<string, number>();
    if (!dryRunResult) return map;
    dryRunResult.affected.forEach(a => {
      if (a.review_period && a.review_year) {
        const key = `${a.review_period} ${a.review_year}`;
        map.set(key, (map.get(key) || 0) + 1);
      }
    });
    return map;
  }, [dryRunResult]);

  // Merge all DB periods with affected periods, sorted chronologically
  const periodOptions = useMemo(() => {
    const allKeys = new Set<string>();
    // Add periods from review_periods table
    allReviewPeriods?.forEach(rp => {
      if (rp.period_name && rp.review_year) {
        allKeys.add(`${rp.period_name} ${rp.review_year}`);
      }
    });
    // Add periods from dry-run (ensures affected periods always appear)
    affectedCountMap.forEach((_, key) => allKeys.add(key));

    return Array.from(allKeys).sort((a, b) => {
      const [mA, yA] = a.split(/ (\d+)$/);
      const [mB, yB] = b.split(/ (\d+)$/);
      const yearDiff = Number(yA) - Number(yB);
      if (yearDiff !== 0) return yearDiff;
      return MONTH_ORDER.indexOf(mA) - MONTH_ORDER.indexOf(mB);
    });
  }, [allReviewPeriods, affectedCountMap]);

  const filteredAffected = useMemo(() => {
    if (!dryRunResult) return [];
    if (filterPeriod === 'all') return dryRunResult.affected;
    return dryRunResult.affected.filter(a =>
      a.review_period && a.review_year && `${a.review_period} ${a.review_year}` === filterPeriod
    );
  }, [dryRunResult, filterPeriod]);

  const reconcileMutation = useMutation({
    mutationFn: async ({ dryRun, kpiIds }: { dryRun: boolean; kpiIds?: string[] }) => {
      const params: Record<string, unknown> = { p_dry_run: dryRun };
      if (periodMode === 'specific') {
        params.p_review_period = selectedMonth;
        params.p_review_year = selectedYear;
      }
      if (kpiIds && kpiIds.length > 0) {
        params.p_kpi_ids = kpiIds;
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
    setFilterPeriod('all');
    setDialogOpen(true);
    try {
      const result = await reconcileMutation.mutateAsync({ dryRun: true });
      setDryRunResult(result);
      setSelectedKpiIds(new Set(result.affected.map(a => a.kpi_id)));
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
      const kpiIds = Array.from(selectedKpiIds);
      const result = await reconcileMutation.mutateAsync({ dryRun: false, kpiIds });
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

      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) { setDialogOpen(false); setDryRunResult(null); setExecuted(false); setSelectedKpiIds(new Set()); setFilterPeriod('all'); } }}>
        <DialogContent className="max-w-6xl max-h-[85vh] overflow-y-auto">
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
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary">{filteredAffected.length} KPI(s)</Badge>
                  {(() => {
                    const orphaned = filteredAffected.filter(a => a.reason === 'missing_stage_orphan').length;
                    const completed = filteredAffected.filter(a => a.reason === 'terminal_stage_completed').length;
                    const mismatch = filteredAffected.filter(a => a.reason === 'review_stage_mismatch').length;
                    const notForwarded = filteredAffected.filter(a => a.reason === 'current_stage_scored_not_forwarded').length;
                    return (
                      <>
                        {orphaned > 0 && <Badge variant="outline" className="text-xs bg-amber-50 dark:bg-amber-900/20">{orphaned} orphaned</Badge>}
                        {completed > 0 && <Badge variant="outline" className="text-xs bg-green-50 dark:bg-green-900/20">{completed} terminal→approved</Badge>}
                        {mismatch > 0 && <Badge variant="outline" className="text-xs bg-purple-50 dark:bg-purple-900/20">{mismatch} stage mismatch</Badge>}
                        {notForwarded > 0 && <Badge variant="outline" className="text-xs bg-orange-50 dark:bg-orange-900/20">{notForwarded} scored not forwarded</Badge>}
                      </>
                    );
                  })()}
                </div>
                {dryRunResult && periodOptions.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <Filter className="h-3.5 w-3.5 text-muted-foreground" />
                    <Select value={filterPeriod} onValueChange={handleFilterChange}>
                      <SelectTrigger className="h-8 w-[220px] text-xs">
                        <SelectValue placeholder="All Periods" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Periods ({dryRunResult.count})</SelectItem>
                        {periodOptions.map(p => {
                          const count = affectedCountMap.get(p) || 0;
                          return (
                            <SelectItem key={p} value={p}>
                              <span className="flex items-center gap-1.5">
                                {p}
                                {count === 0 ? (
                                  <span className="inline-flex items-center gap-0.5 text-green-600 dark:text-green-400">
                                    <CheckCircle2 className="h-3 w-3" />
                                    <span className="text-[10px]">0 issues</span>
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-muted-foreground">({count})</span>
                                )}
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>

              <div className="border rounded-md max-h-[50vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {!executed && (
                        <TableHead className="w-10">
                          <Checkbox
                            checked={filteredAffected.length > 0 && filteredAffected.every(a => selectedKpiIds.has(a.kpi_id))}
                            onCheckedChange={(checked) => {
                              setSelectedKpiIds(prev => {
                                const next = new Set(prev);
                                filteredAffected.forEach(a => {
                                  if (checked) { next.add(a.kpi_id); } else { next.delete(a.kpi_id); }
                                });
                                return next;
                              });
                            }}
                          />
                        </TableHead>
                      )}
                      <TableHead>Employee</TableHead>
                      <TableHead>KPI</TableHead>
                      <TableHead>Current</TableHead>
                      <TableHead>→</TableHead>
                      <TableHead>Target</TableHead>
                      <TableHead>Reason</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAffected.map((item) => (
                      <TableRow key={item.kpi_id} data-state={selectedKpiIds.has(item.kpi_id) ? 'selected' : undefined}>
                        {!executed && (
                          <TableCell>
                            <Checkbox
                              checked={selectedKpiIds.has(item.kpi_id)}
                              onCheckedChange={(checked) => {
                                setSelectedKpiIds(prev => {
                                  const next = new Set(prev);
                                  if (checked) { next.add(item.kpi_id); } else { next.delete(item.kpi_id); }
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium text-sm">{item.employee_name}</TableCell>
                        <TableCell className="text-sm max-w-[220px]">
                          <div className="truncate">{getKpiSummaryText(item.kpi_name)}</div>
                          <div className="text-xs text-muted-foreground truncate">{item.kra_name}</div>
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
                disabled={reconcileMutation.isPending || selectedKpiIds.size === 0}
                className="gap-2"
              >
                {reconcileMutation.isPending ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Confirm & Reconcile {selectedKpiIds.size} of {filteredAffected.length} KPI(s)
              </Button>
            )}
            <Button variant="outline" onClick={() => { setDialogOpen(false); setDryRunResult(null); setExecuted(false); setSelectedKpiIds(new Set()); setFilterPeriod('all'); }}>
              {executed ? 'Close' : 'Cancel'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
