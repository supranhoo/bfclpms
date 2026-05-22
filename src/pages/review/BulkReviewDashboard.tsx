import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, Layers, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/contexts/AuthContext';
import {
  useBulkReviewFlag,
  useBulkScopePreview,
  useBulkReviewSnapshot,
  useBulkManagementApprove,
  type BulkScopeFilters,
  type BulkReviewRow,
} from '@/hooks/useBulkReview';
import { BulkCellDrawer } from '@/components/review/BulkCellDrawer';
import { BulkReviewMatrixGrid } from '@/components/review/BulkReviewMatrixGrid';
import { useToast } from '@/hooks/use-toast';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

// Full month names — must match kpis.review_period exactly (DB stores 'April', 'May', ...).
// Ordered by fiscal year (Apr → Mar) for display.
const PERIOD_OPTIONS = [
  'April', 'May', 'June', 'July', 'August', 'September',
  'October', 'November', 'December', 'January', 'February', 'March',
];
const CALENDAR_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const VIEWER_STAGES = [
  { value: 'manager', label: 'Manager' },
  { value: 'skip_level', label: 'Skip-Level' },
  { value: 'hr_pms', label: 'HR PMS' },
  { value: 'auditor', label: 'Auditor' },
  { value: 'management', label: 'Management' },
];

/**
 * Bulk Review Dashboard (PRD v2.0, Phase 1 — M2 shell).
 *
 * Hard rules enforced here:
 *  - Mounts empty. No `kpis`/`review_submissions` reads on mount.
 *  - Filter changes only fire `bulk_scope_preview` (counts).
 *  - Snapshot RPC fires only after explicit "Load Scope" click.
 *  - 25k cell / 5MB payload cap disables Load button.
 *  - No realtime — manual Refresh pill only.
 */
export default function BulkReviewDashboard() {
  const { effectiveRole } = useAuth();
  const { toast } = useToast();
  const flagQuery = useBulkReviewFlag();

  const now = new Date();
  const defaultPeriod = CALENDAR_MONTHS[now.getMonth()] || 'April';
  const defaultYear = now.getFullYear();

  const [period, setPeriod] = useState<string>(defaultPeriod);
  const [year, setYear] = useState<number>(defaultYear);
  const [viewerStage, setViewerStage] = useState<string>(
    effectiveRole === 'manager' ? 'manager'
      : effectiveRole === 'auditor' ? 'auditor'
      : effectiveRole === 'hr_pms' ? 'hr_pms'
      : effectiveRole === 'management' ? 'management'
      : effectiveRole === 'skip_level' ? 'skip_level'
      : 'manager'
  );
  const [filters] = useState<BulkScopeFilters>({});
  const [scopeLoaded, setScopeLoaded] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeRow, setActiveRow] = useState<BulkReviewRow | null>(null);
  const [confirmApprove, setConfirmApprove] = useState(false);
  const approve = useBulkManagementApprove();

  const flagOn = flagQuery.data === true;

  const preview = useBulkScopePreview(period, year, filters, flagOn);
  const snapshot = useBulkReviewSnapshot(
    period, year, viewerStage, filters, page, 200,
    flagOn && scopeLoaded,
  );

  const capExceeded = preview.data?.cap_exceeded ?? false;
  const canLoad = flagOn && !!preview.data && !capExceeded && (preview.data?.cell_count ?? 0) > 0;

  const loadedRows = snapshot.data?.rows ?? [];
  const variance = useMemo(() => {
    let count = 0;
    for (const r of loadedRows) {
      const scores = [
        r.self_score, r.manager_score, r.skip_level_score,
        r.hr_pms_score, r.auditor_score, r.management_score,
      ].filter((s): s is number => s !== null && s !== undefined);
      if (scores.length >= 2) {
        const max = Math.max(...scores);
        const min = Math.min(...scores);
        if (max - min > 1.0) count++;
      }
    }
    return count;
  }, [loadedRows]);

  const canApprove = effectiveRole === 'management' || effectiveRole === 'admin';
  const canReopen = effectiveRole === 'admin' || effectiveRole === 'management';

  const toggleOne = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleAllFromMatrix = (ids: string[]) => {
    setSelectedIds((prev) => {
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      return allSelected ? new Set() : new Set(ids);
    });
  };

  const handleBulkApprove = async () => {
    const cells = loadedRows
      .filter(r => r.submission_id && selectedIds.has(r.submission_id))
      .map(r => ({ submission_id: r.submission_id!, expected_row_version: r.row_version ?? null }));
    if (cells.length === 0) return;
    try {
      const res = await approve.mutateAsync({ cells, reason: 'Bulk approval from dashboard' });
      toast({
        title: `Approved ${res.applied} / ${cells.length}`,
        description: res.skipped.length ? `${res.skipped.length} skipped — see audit log` : undefined,
      });
      setSelectedIds(new Set());
    } catch (e: any) {
      toast({ title: 'Approval failed', description: e.message, variant: 'destructive' });
    }
  };

  // Flag OFF → hard refuse
  if (flagQuery.isLoading) {
    return (
      <div className="p-6 space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!flagOn) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Bulk Review is disabled</AlertTitle>
          <AlertDescription>
            Bulk Review is disabled by your administrator. Please use the
            standard <Link to="/dashboard?view=team" className="underline">Team Reviews</Link> page.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1800px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <Layers className="h-6 w-6 text-primary" />
          <h1 className="text-2xl font-semibold">Bulk Review Dashboard</h1>
          <Badge variant="secondary">Beta</Badge>
        </div>
        {scopeLoaded && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => snapshot.refetch()}
            disabled={snapshot.isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${snapshot.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        )}
      </div>

      {/* Scope bar */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Scope</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="space-y-1">
              <Label>Period</Label>
              <Select value={period} onValueChange={(v) => { setPeriod(v); setScopeLoaded(false); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Year</Label>
              <Input
                type="number"
                value={year}
                onChange={(e) => { setYear(Number(e.target.value) || defaultYear); setScopeLoaded(false); }}
              />
            </div>
            <div className="space-y-1">
              <Label>My Stage</Label>
              <Select value={viewerStage} onValueChange={setViewerStage}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {VIEWER_STAGES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                disabled={!canLoad}
                onClick={() => { setPage(1); setScopeLoaded(true); }}
              >
                Load Scope
              </Button>
            </div>
          </div>

          {/* Preview counters */}
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            {preview.isLoading ? (
              <Skeleton className="h-4 w-48" />
            ) : preview.data ? (
              <>
                <span><strong className="text-foreground">{preview.data.emp_count}</strong> employees</span>
                <span><strong className="text-foreground">{preview.data.kpi_count}</strong> KPIs</span>
                <span>~{preview.data.est_payload_kb} KB payload</span>
                {capExceeded && (
                  <Badge variant="destructive">
                    Scope too large — narrow filters (cap: 25k cells / 5 MB)
                  </Badge>
                )}
              </>
            ) : null}
          </div>
        </CardContent>
      </Card>

      {/* Empty state */}
      {!scopeLoaded && (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            <Layers className="h-10 w-10 mx-auto mb-3 opacity-40" />
            <p className="font-medium text-foreground mb-1">Pick a scope and click Load Scope</p>
            <p className="text-sm">
              Nothing is fetched until you do — your dashboard stays fast and Cloud-friendly.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Loaded grid */}
      {scopeLoaded && (
        <>
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div className="flex items-center gap-3">
                <CardTitle className="text-base">Review Matrix</CardTitle>
                <Badge variant="outline" className="text-[10px] font-medium">
                  Page {page} / {Math.max(1, Math.ceil((snapshot.data?.total ?? 0) / 200))}
                </Badge>
              </div>
              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                <span>Rows: <strong className="text-foreground tabular-nums">{snapshot.data?.rows?.length ?? 0}</strong></span>
                <span>Total: <strong className="text-foreground tabular-nums">{snapshot.data?.total ?? 0}</strong></span>
                <span>Variance &gt; 1.0: <strong className="text-foreground tabular-nums">{variance}</strong></span>
              </div>
            </CardHeader>
            <CardContent>
              {snapshot.isLoading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-8 w-full" />
                  ))}
                </div>
              ) : snapshot.error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Failed to load snapshot</AlertTitle>
                  <AlertDescription>{(snapshot.error as Error).message}</AlertDescription>
                </Alert>
              ) : loadedRows.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No KPIs match the selected scope.
                </p>
              ) : (
                <BulkReviewMatrixGrid
                  rows={loadedRows}
                  viewerStage={viewerStage}
                  selectedSubmissionIds={selectedIds}
                  onToggleSubmission={toggleOne}
                  onToggleAll={toggleAllFromMatrix}
                  onCellClick={setActiveRow}
                />
              )}

              {/* Pagination */}
              {snapshot.data && snapshot.data.total > 200 && (
                <div className="flex items-center justify-between mt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >Previous</Button>
                  <span className="text-xs text-muted-foreground">
                    Page {page} of {Math.max(1, Math.ceil(snapshot.data.total / 200))}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= Math.ceil(snapshot.data.total / 200)}
                    onClick={() => setPage((p) => p + 1)}
                  >Next</Button>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Action toolbar */}
          {selectedIds.size > 0 && (
            <div className="sticky bottom-4 z-10 mx-auto max-w-fit">
              <Card className="shadow-lg">
                <CardContent className="py-3 px-4 flex items-center gap-3">
                  <span className="text-sm font-medium">{selectedIds.size} selected</span>
                  <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
                    Clear
                  </Button>
                  {canApprove && (
                    <Button
                      size="sm"
                      onClick={() => setConfirmApprove(true)}
                      disabled={approve.isPending}
                    >
                      {approve.isPending ? 'Approving…' : 'Bulk Approve (Mgmt)'}
                    </Button>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </>
      )}

      <BulkCellDrawer
        row={activeRow}
        viewerStage={viewerStage}
        open={!!activeRow}
        onOpenChange={(o) => !o && setActiveRow(null)}
        canReopen={canReopen}
      />

      <ConfirmDestructiveDialog
        open={confirmApprove}
        onCancel={() => setConfirmApprove(false)}
        onConfirm={() => { setConfirmApprove(false); handleBulkApprove(); }}
        title={`Bulk approve ${selectedIds.size} cells?`}
        description="Final scores will be stamped from the highest-priority completed stage (Auditor > HR PMS > Skip-Level > Manager). Per Policy §88 this is immutable except via Re-open."
        confirmLabel="Approve"
        isLoading={approve.isPending}
      />
    </div>
  );
}
