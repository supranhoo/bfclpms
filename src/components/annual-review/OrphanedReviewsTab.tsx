import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { Loader2, RefreshCw, ShieldAlert, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import {
  ORPHAN_REASON_LABEL, ORPHAN_STAGE_LABEL, type OrphanReason,
} from '@/lib/annualReview/orphanReview';

type Row = {
  instance_id: string;
  cycle_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  overall_status: string;
  stage: string;
  is_current_stage: boolean;
  reviewer_id: string | null;
  reviewer_code: string | null;
  reviewer_name: string | null;
  orphan_reason: string;
  suggested_reviewer_id: string | null;
  suggested_reviewer_code: string | null;
  suggested_reviewer_name: string | null;
};

const PAGE_SIZE = 25;

/**
 * ADR-173 — Orphaned Reviews console.
 * Surfaces annual reviews whose enabled stage points at a deactivated or
 * unmapped reviewer, and bulk-reassigns them via
 * `admin_reassign_orphaned_reviewers` (audited).
 */
export function OrphanedReviewsTab() {
  const qc = useQueryClient();
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [reasonFilter, setReasonFilter] = useState<string>('all');
  const [blockingOnly, setBlockingOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [newReviewerId, setNewReviewerId] = useState('');
  const [search, setSearch] = useState('');
  const [reason, setReason] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const { data: rows = [], isLoading, refetch, isFetching } = useQuery({
    queryKey: ['annual-review-orphans'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_orphaned_annual_reviews', { p_cycle_id: null });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
    staleTime: 60_000,
  });

  const filtered = useMemo(() => rows.filter((r) => (
    (stageFilter === 'all' || r.stage === stageFilter)
    && (reasonFilter === 'all' || r.orphan_reason === reasonFilter)
    && (!blockingOnly || r.is_current_stage)
  )), [rows, stageFilter, reasonFilter, blockingOnly]);

  const pageRows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  // A bulk reassignment targets exactly one stage — enforce a single stage in the selection.
  const selectedRows = filtered.filter((r) => selected.has(r.instance_id + r.stage));
  const selectedStages = new Set(selectedRows.map((r) => r.stage));
  const stageConflict = selectedStages.size > 1;
  const targetStage = selectedRows[0]?.stage ?? null;

  const { data: people = [] } = useQuery({
    queryKey: ['annual-review-orphan-pool', search],
    queryFn: async () => {
      let q = supabase.from('profiles')
        .select('id, full_name, employee_code')
        .eq('is_active', true)
        .order('full_name', { ascending: true })
        .limit(50);
      const s = search.trim();
      if (s) q = q.or(`full_name.ilike.%${s}%,employee_code.ilike.%${s}%`);
      const { data, error } = await q;
      if (error) throw error;
      return data ?? [];
    },
    staleTime: 60_000,
  });

  const reassign = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('admin_reassign_orphaned_reviewers', {
        p_instance_ids: selectedRows.map((r) => r.instance_id),
        p_stage: targetStage!,
        p_new_reviewer_id: newReviewerId,
        p_reason: reason.trim(),
      });
      if (error) throw error;
      return data as { succeeded: number; failed: number };
    },
    onSuccess: (res) => {
      toast.success(`Reassigned ${res.succeeded} review(s)${res.failed ? `, ${res.failed} failed` : ''}.`);
      setSelected(new Set());
      setNewReviewerId('');
      setReason('');
      qc.invalidateQueries({ queryKey: ['annual-review-orphans'] });
      qc.invalidateQueries({ queryKey: ['annual-review-instances'] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggle = (key: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const allPageSelected = pageRows.length > 0 && pageRows.every((r) => selected.has(r.instance_id + r.stage));

  const suggested = selectedRows.find((r) => r.suggested_reviewer_id)?.suggested_reviewer_id ?? null;
  const canSubmit = selectedRows.length > 0 && !stageConflict && !!newReviewerId && reason.trim().length >= 3;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex-row items-start justify-between gap-3 space-y-0">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldAlert className="h-5 w-5 text-destructive" />
              Orphaned Reviews
              <Badge variant={rows.length ? 'destructive' : 'secondary'}>{rows.length}</Badge>
            </CardTitle>
            <CardDescription>
              Reviews whose enabled stage points at a deactivated or unmapped reviewer. Fixing the
              organisation master (BU / Department head) resolves most of these automatically.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Stage</Label>
              <Select value={stageFilter} onValueChange={(v) => { setStageFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All stages</SelectItem>
                  {Object.entries(ORPHAN_STAGE_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Reason</Label>
              <Select value={reasonFilter} onValueChange={(v) => { setReasonFilter(v); setPage(0); }}>
                <SelectTrigger className="h-9 w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All reasons</SelectItem>
                  {Object.entries(ORPHAN_REASON_LABEL).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox checked={blockingOnly} onCheckedChange={(v) => { setBlockingOnly(!!v); setPage(0); }} />
              Blocking the workflow now
            </label>
          </div>

          {isLoading ? (
            <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
          ) : filtered.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              <UserCheck className="h-6 w-6 mx-auto mb-2 text-muted-foreground" />
              No orphaned reviews.
            </div>
          ) : (
            <>
              <div className="rounded-md border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allPageSelected}
                          onCheckedChange={(v) => setSelected((prev) => {
                            const next = new Set(prev);
                            pageRows.forEach((r) => {
                              const k = r.instance_id + r.stage;
                              if (v) next.add(k); else next.delete(k);
                            });
                            return next;
                          })}
                        />
                      </TableHead>
                      <TableHead>Employee</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead>Blocking reviewer</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Suggested successor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => {
                      const key = r.instance_id + r.stage;
                      return (
                        <TableRow key={key}>
                          <TableCell>
                            <Checkbox checked={selected.has(key)} onCheckedChange={() => toggle(key)} />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <div className="font-medium">{r.employee_name ?? '—'}</div>
                            <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {r.overall_status}
                            {r.is_current_stage && <Badge variant="destructive" className="ml-2">Blocking</Badge>}
                          </TableCell>
                          <TableCell>{ORPHAN_STAGE_LABEL[r.stage as keyof typeof ORPHAN_STAGE_LABEL] ?? r.stage}</TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {r.reviewer_name ? `${r.reviewer_name} (${r.reviewer_code ?? '—'})` : '— none —'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {ORPHAN_REASON_LABEL[r.orphan_reason as OrphanReason] ?? r.orphan_reason}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">
                            {r.suggested_reviewer_name
                              ? `${r.suggested_reviewer_name} (${r.suggested_reviewer_code ?? '—'})`
                              : '—'}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  {filtered.length} finding(s) · page {page + 1} of {pageCount}
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
                  <Button variant="outline" size="sm" disabled={page + 1 >= pageCount} onClick={() => setPage((p) => p + 1)}>Next</Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {selectedRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bulk reassign {selectedRows.length} review(s)</CardTitle>
            <CardDescription>
              {stageConflict
                ? 'Select findings for a single stage at a time.'
                : `Stage: ${ORPHAN_STAGE_LABEL[targetStage as keyof typeof ORPHAN_STAGE_LABEL] ?? targetStage}`}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1">
                <Label>Search replacement reviewer</Label>
                <Input placeholder="Name or code…" value={search} onChange={(e) => setSearch(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>New reviewer</Label>
                <Select value={newReviewerId} onValueChange={setNewReviewerId}>
                  <SelectTrigger className="h-10"><SelectValue placeholder="Pick someone" /></SelectTrigger>
                  <SelectContent>
                    {people.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.full_name ?? p.id} {p.employee_code ? `(${p.employee_code})` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {suggested && suggested !== newReviewerId && (
                  <Button variant="link" size="sm" className="px-0 h-auto" onClick={() => setNewReviewerId(suggested)}>
                    Use suggested successor
                  </Button>
                )}
              </div>
            </div>
            <div className="space-y-1">
              <Label>Reason (required, min 3 chars)</Label>
              <Textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. Previous BU Head deactivated; succession to current head"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setSelected(new Set())}>Clear selection</Button>
              <Button disabled={!canSubmit || reassign.isPending} onClick={() => setConfirmOpen(true)}>
                {reassign.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Reassign
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <ConfirmDestructiveDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={() => { setConfirmOpen(false); reassign.mutate(); }}
        title="Reassign orphaned reviews?"
        description={`This changes the ${targetStage ?? ''} reviewer on ${selectedRows.length} review(s). The change is audit-logged and can be reverted from the repair log.`}
        confirmLabel="Reassign"
        isLoading={reassign.isPending}
      />
    </div>
  );
}
