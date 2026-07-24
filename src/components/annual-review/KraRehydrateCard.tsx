/**
 * ADR-161 — KRA Score Rehydrate admin card.
 *
 * Manual admin action to re-pull Carry-KRA scores for completed KRA-based
 * Annual Review instances after monthly KPI updates (e.g., once June is
 * finalized). Runs are audit-logged and every apply can be rolled back
 * from its stored pre-image.
 */
import { useMemo, useState } from 'react';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { RefreshCw, Undo2 } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  startKraRehydrate, rollbackKraRehydrateRun,
  listKraRehydrateRuns, listKraRehydrateItems,
  type KraRehydrateRun,
} from '@/services/annualReview/kraRehydrate';

interface CycleOption { id: string; name: string; }

function useCycles() {
  return useQuery({
    queryKey: ['annual-review-cycles-lite'],
    queryFn: async (): Promise<CycleOption[]> => {
      const { data, error } = await supabase
        .from('annual_review_cycles')
        .select('id, name, review_year')
        .order('review_year', { ascending: false });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({ id: r.id, name: r.name }));
    },
    staleTime: 5 * 60_000,
  });
}

function useRuns(cycleId: string | undefined) {
  return useQuery({
    queryKey: ['kra-rehydrate-runs', cycleId],
    queryFn: () => listKraRehydrateRuns(cycleId!),
    enabled: !!cycleId,
    staleTime: 15_000,
  });
}

function useItems(runId: string | undefined, page: number) {
  return useQuery({
    queryKey: ['kra-rehydrate-items', runId, page],
    queryFn: () => listKraRehydrateItems(runId!, { page, pageSize: 50 }),
    enabled: !!runId,
    staleTime: 30_000,
  });
}

function StatusBadge({ status }: { status: KraRehydrateRun['status'] }) {
  const variant = status === 'failed' ? 'destructive' : status === 'running' ? 'secondary' : 'default';
  return <Badge variant={variant as any}>{status}</Badge>;
}
function ModeBadge({ mode }: { mode: KraRehydrateRun['mode'] }) {
  return <Badge variant={mode === 'apply' ? 'default' : mode === 'rollback' ? 'destructive' : 'secondary'}>{mode}</Badge>;
}

export function KraRehydrateCard() {
  const qc = useQueryClient();
  const { data: cycles = [], isLoading: cyclesLoading } = useCycles();
  const [cycleId, setCycleId] = useState<string | undefined>();
  const activeCycleId = cycleId ?? cycles[0]?.id;

  const [reason, setReason] = useState('');
  const [selectedRunId, setSelectedRunId] = useState<string | undefined>();
  const [page, setPage] = useState(0);

  // Apply-confirm and Rollback-confirm state.
  const [confirmApply, setConfirmApply] = useState<{ runId: string } | null>(null);
  const [applyToken, setApplyToken] = useState('');
  const [confirmRollback, setConfirmRollback] = useState<{ runId: string } | null>(null);
  const [rollbackToken, setRollbackToken] = useState('');
  const [rollbackReason, setRollbackReason] = useState('');

  const { data: runs = [], isLoading: runsLoading } = useRuns(activeCycleId);
  const { data: itemsData, isLoading: itemsLoading } = useItems(selectedRunId, page);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['kra-rehydrate-runs'] });
    qc.invalidateQueries({ queryKey: ['kra-rehydrate-items'] });
  };

  const dryRun = useMutation({
    mutationFn: async () => {
      if (!activeCycleId) throw new Error('Select a cycle');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      return startKraRehydrate({ cycleId: activeCycleId, mode: 'dry_run', reason: reason.trim() });
    },
    onSuccess: (runId) => {
      toast.success('Preview generated');
      setSelectedRunId(runId);
      setPage(0);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Preview failed'),
  });

  const apply = useMutation({
    mutationFn: async () => {
      if (!activeCycleId) throw new Error('Select a cycle');
      if (reason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      return startKraRehydrate({ cycleId: activeCycleId, mode: 'apply', reason: reason.trim() });
    },
    onSuccess: (runId) => {
      toast.success('KRA scores rehydrated');
      setSelectedRunId(runId);
      setPage(0);
      // Also invalidate downstream annual review caches so read UIs refresh.
      qc.invalidateQueries({ queryKey: ['annual-review-instances'] });
      qc.invalidateQueries({ queryKey: ['annual-review-instance'] });
      qc.invalidateQueries({ queryKey: ['comprehensive-annual-review-report'] });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Apply failed'),
  });

  const rollback = useMutation({
    mutationFn: async () => {
      if (!confirmRollback) throw new Error('No run selected');
      if (rollbackReason.trim().length < 10) throw new Error('Reason must be at least 10 characters');
      return rollbackKraRehydrateRun(confirmRollback.runId, rollbackReason.trim());
    },
    onSuccess: (runId) => {
      toast.success('Rollback complete');
      setConfirmRollback(null);
      setRollbackReason('');
      setRollbackToken('');
      setSelectedRunId(runId);
      qc.invalidateQueries({ queryKey: ['annual-review-instances'] });
      qc.invalidateQueries({ queryKey: ['annual-review-instance'] });
      qc.invalidateQueries({ queryKey: ['comprehensive-annual-review-report'] });
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? 'Rollback failed'),
  });

  const items = itemsData?.rows ?? [];
  const total = itemsData?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / 50));
  const canPrev = page > 0;
  const canNext = page + 1 < totalPages;

  const summary = useMemo(() => {
    const changed = items.filter((i) => (i.delta_total ?? 0) !== 0 || i.band_changed).length;
    return { rendered: items.length, changed };
  }, [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          KRA score rehydrate (post-monthly refresh)
        </CardTitle>
        <CardDescription>
          For KRA-based templates only. Recomputes each Carry-KRA slot from the latest monthly
          KPI scores and updates the completed review's total &amp; rating. Non-KRA reviews and
          in-progress reviews are skipped. Every apply run is fully reversible.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <Label className="text-xs">Cycle</Label>
            <Select value={activeCycleId} onValueChange={(v) => { setCycleId(v); setSelectedRunId(undefined); setPage(0); }}>
              <SelectTrigger><SelectValue placeholder={cyclesLoading ? 'Loading…' : 'Select cycle'} /></SelectTrigger>
              <SelectContent>
                {cycles.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Reason (audit trail, min 10 chars)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. June KPI scoring finalized on 30-Jun; refreshing KRA-based appraisals."
              rows={2}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={() => dryRun.mutate()}
            disabled={!activeCycleId || reason.trim().length < 10 || dryRun.isPending}
          >
            {dryRun.isPending ? 'Previewing…' : 'Preview (dry run)'}
          </Button>
          <Button
            onClick={() => {
              if (!selectedRunId) { toast.info('Run a preview first, then Apply.'); return; }
              const run = runs.find((r) => r.id === selectedRunId);
              if (!run) return;
              setConfirmApply({ runId: selectedRunId });
              setApplyToken('');
            }}
            disabled={!selectedRunId || apply.isPending}
          >
            {apply.isPending ? 'Applying…' : 'Apply changes'}
          </Button>
          <span className="text-xs text-muted-foreground ml-2">
            Preview first — Apply only becomes active once a preview run is selected below.
          </span>
        </div>

        {/* Runs list */}
        <div>
          <div className="text-sm font-medium mb-1">Recent runs</div>
          {runsLoading ? (
            <Skeleton className="h-24 w-full" />
          ) : runs.length === 0 ? (
            <div className="text-sm text-muted-foreground">No runs yet.</div>
          ) : (
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Mode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Instances</TableHead>
                    <TableHead className="text-right">Changed</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {runs.map((r) => (
                    <TableRow
                      key={r.id}
                      className={r.id === selectedRunId ? 'bg-muted/50 cursor-pointer' : 'cursor-pointer'}
                      onClick={() => { setSelectedRunId(r.id); setPage(0); }}
                    >
                      <TableCell className="whitespace-nowrap text-xs">{new Date(r.created_at).toLocaleString()}</TableCell>
                      <TableCell><ModeBadge mode={r.mode} /></TableCell>
                      <TableCell><StatusBadge status={r.status} /></TableCell>
                      <TableCell className="text-right">{r.instance_count}</TableCell>
                      <TableCell className="text-right">{r.changed_count}</TableCell>
                      <TableCell className="max-w-xs truncate" title={r.reason}>{r.reason}</TableCell>
                      <TableCell className="text-right">
                        {r.mode === 'apply' && r.status === 'completed' && !r.rollback_of_run_id && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => { e.stopPropagation(); setConfirmRollback({ runId: r.id }); setRollbackToken(''); setRollbackReason(''); }}
                          >
                            <Undo2 className="h-4 w-4 mr-1" /> Rollback
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Selected run items */}
        {selectedRunId && (
          <div>
            <div className="flex items-center justify-between mb-1">
              <div className="text-sm font-medium">
                Per-instance diff{' '}
                <span className="text-muted-foreground font-normal">
                  ({summary.changed} of {summary.rendered} rendered would change; total {total})
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="ghost" disabled={!canPrev} onClick={() => setPage(page - 1)}>Prev</Button>
                <span className="text-xs">Page {page + 1} / {totalPages}</span>
                <Button size="sm" variant="ghost" disabled={!canNext} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Old Total</TableHead>
                    <TableHead className="text-right">New Total</TableHead>
                    <TableHead className="text-right">Δ</TableHead>
                    <TableHead>Old Rating</TableHead>
                    <TableHead>New Rating</TableHead>
                    <TableHead>Band changed?</TableHead>
                    <TableHead>Applied</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {itemsLoading ? (
                    <TableRow><TableCell colSpan={8}><Skeleton className="h-16 w-full" /></TableCell></TableRow>
                  ) : items.length === 0 ? (
                    <TableRow><TableCell colSpan={8} className="text-center text-sm text-muted-foreground">No items.</TableCell></TableRow>
                  ) : items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell className="font-mono text-xs">{i.employee_id.slice(0, 8)}…</TableCell>
                      <TableCell className="text-right">{i.old_total_score ?? '—'}</TableCell>
                      <TableCell className="text-right">{i.new_total_score ?? '—'}</TableCell>
                      <TableCell className={`text-right ${(i.delta_total ?? 0) === 0 ? 'text-muted-foreground' : (i.delta_total ?? 0) > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {i.delta_total == null ? '—' : (i.delta_total > 0 ? `+${i.delta_total}` : i.delta_total)}
                      </TableCell>
                      <TableCell>{i.old_final_rating ?? '—'}</TableCell>
                      <TableCell>{i.new_final_rating ?? '—'}</TableCell>
                      <TableCell>{i.band_changed ? <Badge variant="destructive">Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                      <TableCell>{i.applied ? <Badge>Yes</Badge> : <Badge variant="secondary">No</Badge>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {/* Apply confirm dialog */}
        <Dialog open={!!confirmApply} onOpenChange={(o) => !o && setConfirmApply(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirm apply</DialogTitle>
              <DialogDescription>
                This will overwrite <b>system_scores</b>, <b>total_score</b>, and <b>final_rating</b> on every
                completed KRA-based review in the selected cycle where the recomputed value differs. The
                current pre-image is stored and the run can be rolled back at any time. Type <b>REHYDRATE</b> to confirm.
              </DialogDescription>
            </DialogHeader>
            <Input
              value={applyToken}
              onChange={(e) => setApplyToken(e.target.value)}
              placeholder="Type REHYDRATE"
              autoFocus
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmApply(null)}>Cancel</Button>
              <Button
                disabled={applyToken !== 'REHYDRATE' || apply.isPending}
                onClick={() => { setConfirmApply(null); apply.mutate(); }}
              >
                Apply now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Rollback confirm dialog */}
        <Dialog open={!!confirmRollback} onOpenChange={(o) => !o && setConfirmRollback(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rollback run</DialogTitle>
              <DialogDescription>
                Restores every instance touched by this run to its exact prior scores and rating.
                Type <b>ROLLBACK</b> and provide a reason (min 10 chars).
              </DialogDescription>
            </DialogHeader>
            <Textarea
              value={rollbackReason}
              onChange={(e) => setRollbackReason(e.target.value)}
              placeholder="Reason for rollback…"
              rows={2}
            />
            <Input
              value={rollbackToken}
              onChange={(e) => setRollbackToken(e.target.value)}
              placeholder="Type ROLLBACK"
            />
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmRollback(null)}>Cancel</Button>
              <Button
                variant="destructive"
                disabled={rollbackToken !== 'ROLLBACK' || rollbackReason.trim().length < 10 || rollback.isPending}
                onClick={() => rollback.mutate()}
              >
                Rollback now
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

export default KraRehydrateCard;
