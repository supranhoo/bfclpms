/**
 * ADR-260 / ADR-313 — De-duplication queue, bulk edition.
 *
 * Nothing merges automatically: the scanner only files proposals, an admin
 * decides, and a decision never touches historical scores. ADR-313 groups the
 * pairwise proposals by canonical KPI, splits them into "identical after
 * cleaning" (safe to batch) and "needs judgement", and lets an admin clear a
 * whole page in one action instead of reviewing every pair.
 */
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AlertTriangle, Check, Loader2, ScanSearch, SplitSquareHorizontal, X } from 'lucide-react';
import {
  useMergeProposals,
  useGenerateMergeProposals,
  useDecideMergeProposal,
  useDecideMergeProposalsBulk,
} from '@/hooks/useBuConsole';
import { useBuConsoleCapability } from '@/hooks/useBuConsoleCapability';
import {
  buildMergeGroups,
  filterGroups,
  proposalIdsForKeys,
  summarizeGroups,
  type MergeProposalLike,
  type TriageFilter,
} from './mergeTriage';

type StatusTab = 'pending' | 'approved' | 'rejected';

function Stat({ label, value, hint }: { label: string; value: number | string; hint?: string }) {
  return (
    <div className="min-w-0 rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-[11px] text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export function MergeProposalsTab() {
  const [status, setStatus] = useState<StatusTab>('pending');
  const [triage, setTriage] = useState<TriageFilter>('all');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // ADR-284 — decisions are admin-only; other tiers get a read-only queue.
  const { canWrite } = useBuConsoleCapability();
  const { data, isLoading } = useMergeProposals(status, page);
  const generate = useGenerateMergeProposals();
  const decide = useDecideMergeProposal();
  const bulk = useDecideMergeProposalsBulk();
  const scanError = generate.error as Error | null;

  const rows = (data?.rows ?? []) as unknown as MergeProposalLike[];
  const total = data?.total ?? 0;
  const pageSize = data?.page_size ?? 200;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const allGroups = useMemo(() => buildMergeGroups(rows), [rows]);
  const groups = useMemo(() => filterGroups(allGroups, triage), [allGroups, triage]);
  const summary = useMemo(() => summarizeGroups(allGroups), [allGroups]);

  const decidable = status === 'pending' && canWrite;
  const busy = bulk.isPending || decide.isPending;

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const allShownSelected = groups.length > 0 && groups.every((g) => selected.has(g.key));
  const toggleAllShown = () =>
    setSelected(allShownSelected ? new Set() : new Set(groups.map((g) => g.key)));

  const runBulk = (approve: boolean) => {
    const ids = proposalIdsForKeys(allGroups, selected);
    if (!ids.length) return;
    bulk.mutate(
      { ids, approve, note: approve ? 'Bulk decision (ADR-313)' : 'Bulk rejection (ADR-313)' },
      { onSuccess: () => setSelected(new Set()) },
    );
  };

  const selectSafe = () =>
    setSelected(new Set(allGroups.filter((g) => g.triage === 'safe').map((g) => g.key)));

  return (
    <Card className="min-w-0 overflow-hidden">
      <CardHeader className="flex flex-col items-start gap-4 lg:flex-row lg:justify-between">
        <div className="min-w-0 space-y-1">
          <CardTitle>Duplicate KPI merge queue</CardTitle>
          <CardDescription className="max-w-3xl">
            Near-identical KPI names are grouped by the metric they describe. Approving records
            the decision — it never edits past scores.
          </CardDescription>
        </div>
        <div className="flex w-full min-w-0 flex-col gap-2 sm:w-auto sm:flex-row sm:shrink-0">
          <Button variant="outline" asChild>
            <Link to="/admin/kpi-standardization?tab=split">
              <SplitSquareHorizontal className="mr-2 h-4 w-4" />
              Clean KPI text
            </Link>
          </Button>
          {canWrite && (
            <Button onClick={() => generate.mutate(undefined)} disabled={generate.isPending}>
              {generate.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                : <ScanSearch className="mr-2 h-4 w-4" />}
              Scan for duplicates
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="min-w-0 space-y-4">
        <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat label="Groups on this page" value={summary.groups} hint={`${summary.proposals} pairs`} />
          <Stat label="Identical after cleaning" value={summary.safeGroups} hint="safe to batch" />
          <Stat label="Needs judgement" value={summary.judgementGroups} hint="different scale or logic" />
          <Stat label="Employees affected" value={summary.employees} />
        </div>

        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <Tabs value={status} onValueChange={(v) => { setStatus(v as StatusTab); setPage(1); setSelected(new Set()); }}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="approved">Approved</TabsTrigger>
              <TabsTrigger value="rejected">Rejected</TabsTrigger>
            </TabsList>
          </Tabs>
          <Tabs value={triage} onValueChange={(v) => { setTriage(v as TriageFilter); setSelected(new Set()); }}>
            <TabsList className="h-auto max-w-full flex-wrap justify-start">
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="safe">Identical</TabsTrigger>
              <TabsTrigger value="judgement">Needs judgement</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {scanError && (
          <div
            role="alert"
            className="min-w-0 overflow-hidden break-words flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-medium">Duplicate scan could not run</p>
              <p className="text-destructive/90">
                {scanError.message || 'Unexpected error while scanning for duplicate KPI names.'}
              </p>
              <p className="text-destructive/80">
                The queue below may be incomplete — it is not confirmation that there are no duplicates.
              </p>
            </div>
          </div>
        )}

        {decidable && (
          <div className="flex min-w-0 flex-wrap items-center gap-2 rounded-md border bg-muted/40 p-2">
            <Checkbox
              checked={allShownSelected}
              onCheckedChange={toggleAllShown}
              aria-label="Select all groups shown"
            />
            <span className="text-sm text-muted-foreground">
              {selected.size > 0
                ? `${selected.size} group${selected.size === 1 ? '' : 's'} selected`
                : 'Select groups to decide in bulk'}
            </span>
            <Button size="sm" variant="ghost" onClick={selectSafe} disabled={summary.safeGroups === 0}>
              Select all identical
            </Button>
            <div className="flex w-full flex-wrap gap-2 sm:ml-auto sm:w-auto">
              <Button size="sm" disabled={selected.size === 0 || busy} onClick={() => runBulk(true)}>
                {bulk.isPending ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}
                Approve selected
              </Button>
              <Button size="sm" variant="outline" disabled={selected.size === 0 || busy} onClick={() => runBulk(false)}>
                <X className="mr-1 h-3.5 w-3.5" /> Reject selected
              </Button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        )}

        {!isLoading && groups.length === 0 && (
          <p className="rounded-md border p-6 text-center text-sm text-muted-foreground">
            {scanError
              ? 'The list could not be refreshed because the last scan failed.'
              : 'Nothing in this list. Run a scan to look for duplicates.'}
          </p>
        )}

        {!isLoading && groups.length > 0 && (
          <div className="min-w-0 space-y-3">
            {groups.map((g) => (
              <div key={g.key} className="min-w-0 overflow-hidden rounded-md border">
                <div className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b bg-muted/30 p-3 lg:grid-cols-[auto_minmax(0,1fr)_auto]">
                  {decidable && (
                    <Checkbox
                      className="mt-1"
                      checked={selected.has(g.key)}
                      onCheckedChange={() => toggle(g.key)}
                      aria-label={`Select ${g.canonical_kpi_name}`}
                    />
                  )}
                  <div className="min-w-0">
                    <p className="break-words font-medium leading-snug">{g.suggestedCanonicalKpiName}</p>
                    <p className="mt-1 break-words text-xs text-muted-foreground">{g.canonical_kra_name}</p>
                  </div>
                  <div className="col-span-2 flex min-w-0 flex-wrap items-center gap-2 text-xs lg:col-span-1 lg:justify-end">
                    <Badge variant={g.triage === 'safe' ? 'secondary' : 'outline'}>
                      {g.triage === 'safe' ? 'Identical after cleaning' : 'Needs judgement'}
                    </Badge>
                    <span className="break-words text-muted-foreground tabular-nums">
                      {g.variantCount} variant{g.variantCount === 1 ? '' : 's'} · {g.affectedKpiCount} rows · {g.affectedEmployeeCount} employees
                    </span>
                  </div>
                </div>
                <ul className="divide-y">
                  {g.proposals.map((p) => (
                    <li key={p.id} className="grid min-w-0 grid-cols-1 items-start gap-3 p-3 text-sm lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
                      <div className="min-w-0 flex-1">
                        <p className="break-words leading-snug">{p.variant_kpi_name}</p>
                        <p className="mt-1 break-words text-xs text-muted-foreground">{p.variant_kra_name}</p>
                      </div>
                      <Badge variant={p.match_type === 'exact' ? 'secondary' : 'outline'}>
                        {p.match_type}
                        {p.similarity != null && ` · ${Math.round(Number(p.similarity) * 100)}%`}
                      </Badge>
                      {decidable && (
                        <div className="flex flex-wrap gap-2 lg:justify-end">
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() => decide.mutate({ id: p.id, approve: true })}
                          >
                            <Check className="mr-1 h-3.5 w-3.5" /> Approve
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy}
                            onClick={() => decide.mutate({ id: p.id, approve: false })}
                          >
                            <X className="mr-1 h-3.5 w-3.5" /> Reject
                          </Button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}

        {!isLoading && total > 0 && (
          <div className="flex min-w-0 flex-col gap-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="break-words text-muted-foreground">
              {groups.length} group{groups.length === 1 ? '' : 's'} from {rows.length} of {total} proposal
              {total === 1 ? '' : 's'} · page {data?.page ?? 1} of {totalPages}
            </span>
            {totalPages > 1 && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => { setPage(p => p - 1); setSelected(new Set()); }}>Previous</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => { setPage(p => p + 1); setSelected(new Set()); }}>Next</Button>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
