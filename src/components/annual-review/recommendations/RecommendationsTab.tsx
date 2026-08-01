/**
 * ADR-226 — Recommendations governance queue (HR / Management / Admin).
 *
 * Server-side paginated (POLICY §13) via `ar_recommendation_queue`; every
 * decision goes through `ar_decide_recommendation` /
 * `ar_bulk_decide_recommendations` and is audited.
 */
import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Download, Loader2, Settings2, Upload, Wand2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  describeRecommendationFilters,
  downloadRecommendationExcel,
  fetchAllRecommendationRows,
  MAX_RECOMMENDATION_EXPORT_ROWS,
} from '@/lib/annualReview/recommendationExport';
import { LegacyImportDialog } from './LegacyImportDialog';
import { ReclassifyDialog } from './ReclassifyDialog';
import { RecommendationKeywordRulesCard } from './RecommendationKeywordRulesCard';
import { useActiveCycle } from '@/hooks/useAnnualReview';
import {
  useBulkDecideRecommendations,
  useDecideRecommendation,
  useRecommendationQueue,
  useRecommendationTypes,
} from '@/hooks/useAnnualReviewRecommendations';
import {
  RECOMMENDATION_STATUS_LABEL,
  formatRecommendationAmount,
  type RecommendationQueueRow,
  type RecommendationStatus,
} from '@/services/annualReview/recommendations';

const PAGE_SIZE = 25;
const ALL = '__all__';

type SourceFilter = typeof ALL | 'stage_form' | 'legacy_import';

const DECISIONS: RecommendationStatus[] = [
  'approved', 'approved_modified', 'rejected', 'deferred', 'implemented',
];

function statusVariant(s: RecommendationStatus) {
  if (s === 'approved' || s === 'implemented') return 'default' as const;
  if (s === 'rejected') return 'destructive' as const;
  return 'secondary' as const;
}

export function RecommendationsTab() {
  const { data: cycle } = useActiveCycle();
  const { data: types = [] } = useRecommendationTypes();

  const [status, setStatus] = useState<string>(ALL);
  const [typeKey, setTypeKey] = useState<string>(ALL);
  const [monetaryOnly, setMonetaryOnly] = useState(false);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [decideRow, setDecideRow] = useState<RecommendationQueueRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [source, setSource] = useState<SourceFilter>(ALL);
  const [importOpen, setImportOpen] = useState(false);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [reclassifyRow, setReclassifyRow] = useState<RecommendationQueueRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const filters = useMemo(
    () => ({
      cycleId: cycle?.id ?? '',
      status: status === ALL ? null : (status as RecommendationStatus),
      typeKey: typeKey === ALL ? null : typeKey,
      monetaryOnly,
      search: search.trim() || null,
      source: source === ALL ? null : source,
      page,
      pageSize: PAGE_SIZE,
    }),
    [cycle?.id, status, typeKey, monetaryOnly, search, source, page],
  );

  const { data, isLoading, isFetching, isError, error, refetch } = useRecommendationQueue(filters, !!cycle?.id);
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const exportCsv = () => {
    const head = [
      'Employee code', 'Employee', 'Department', 'Business unit', 'Designation',
      'Recommended by', 'Stage', 'Types', 'Amount asked', 'Amount approved',
      'Proposed designation', 'Proposed grade', 'Effective from', 'Rating',
      'Status', 'Source', 'Decision reason', 'Narrative',
    ];
    const body = rows.map((r) => [
      r.employee_code ?? '', r.employee_name ?? '', r.department_name ?? '',
      r.business_unit_name ?? '', r.designation_name ?? '', r.reviewer_name ?? '',
      r.reviewer_role, (r.type_labels ?? []).join('; '),
      formatRecommendationAmount(r.amount_kind, r.amount_value),
      formatRecommendationAmount(r.approved_amount_kind, r.approved_amount_value),
      r.proposed_designation ?? '', r.proposed_grade ?? '', r.effective_from ?? '',
      r.final_rating ?? '', RECOMMENDATION_STATUS_LABEL[r.status] ?? r.status,
      r.source === 'legacy_import' ? 'Legacy import' : 'Review form',
      r.decision_reason ?? '', (r.narrative ?? '').replace(/\s+/g, ' '),
    ]);
    const csv = [head, ...body]
      .map((line) => line.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `annual-review-recommendations-page-${page + 1}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filterNote = describeRecommendationFilters(filters);
  const baseName = `annual-review-recommendations-${new Date().toISOString().slice(0, 10)}`;

  const exportPageExcel = () => {
    downloadRecommendationExcel(rows, filterNote, `${baseName}-page-${page + 1}.xlsx`);
  };

  const exportAllExcel = async () => {
    setIsExporting(true);
    const toastId = toast.loading('Preparing Excel export…');
    try {
      const { rows: allRows, capped } = await fetchAllRecommendationRows(
        filters,
        (fetched, t) => toast.loading(`Fetched ${fetched} of ${t}…`, { id: toastId }),
      );
      if (!allRows.length) {
        toast.error('No rows match these filters.', { id: toastId });
        return;
      }
      downloadRecommendationExcel(allRows, filterNote, `${baseName}-all.xlsx`);
      toast.success(
        capped
          ? `Export capped at ${MAX_RECOMMENDATION_EXPORT_ROWS.toLocaleString()} rows — narrow the filters for the rest.`
          : `Exported ${allRows.length.toLocaleString()} recommendation(s).`,
        { id: toastId },
      );
    } catch (e) {
      toast.error(`Export failed: ${(e as Error)?.message ?? 'unknown error'}`, { id: toastId });
    } finally {
      setIsExporting(false);
    }
  };

  if (!cycle?.id) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          No active annual review cycle. Activate a cycle to review recommendations.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recommendations — {cycle.name ?? 'Active cycle'}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Status</Label>
              <Select value={status} onValueChange={(v) => { setStatus(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All statuses</SelectItem>
                  {(Object.keys(RECOMMENDATION_STATUS_LABEL) as RecommendationStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{RECOMMENDATION_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[180px]">
              <Label className="text-xs text-muted-foreground">Type</Label>
              <Select value={typeKey} onValueChange={(v) => { setTypeKey(v); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All types</SelectItem>
                  {types.map((t) => (
                    <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 min-w-[220px] flex-1">
              <Label className="text-xs text-muted-foreground" htmlFor="rec-search">Search</Label>
              <Input
                id="rec-search"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(0); }}
                placeholder="Employee, code or narrative…"
              />
            </div>
            <label className="flex items-center gap-2 text-sm pb-2">
              <Checkbox
                checked={monetaryOnly}
                onCheckedChange={(v) => { setMonetaryOnly(!!v); setPage(0); }}
              />
              Monetary only
            </label>
            <div className="space-y-1.5 min-w-[170px]">
              <Label className="text-xs text-muted-foreground">Source</Label>
              <Select value={source} onValueChange={(v) => { setSource(v as SourceFilter); setPage(0); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>All sources</SelectItem>
                  <SelectItem value="stage_form">Review form</SelectItem>
                  <SelectItem value="legacy_import">Legacy import</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" disabled={!rows.length || isExporting}>
                  {isExporting
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <Download className="h-4 w-4 mr-2" />}
                  Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={exportPageExcel}>Current page (Excel)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportAllExcel}>All filtered rows (Excel)</DropdownMenuItem>
                <DropdownMenuItem onClick={exportCsv}>Current page (CSV)</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
              <Upload className="h-4 w-4 mr-2" />Import legacy
            </Button>
            <Button variant="outline" size="sm" onClick={() => setRulesOpen((o) => !o)}>
              <Settings2 className="h-4 w-4 mr-2" />{rulesOpen ? 'Hide rules' : 'Classification rules'}
            </Button>
          </div>

          {rulesOpen && <RecommendationKeywordRulesCard />}

          {selectedIds.length > 0 && (
            <div className="flex items-center gap-3 rounded-md border bg-muted/40 p-2 text-sm">
              <span>{selectedIds.length} selected</span>
              <Button size="sm" onClick={() => setBulkOpen(true)}>Bulk decision</Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>Clear</Button>
            </div>
          )}

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8" />
                  <TableHead>Employee</TableHead>
                  <TableHead>Dept / BU</TableHead>
                  <TableHead>Recommended by</TableHead>
                  <TableHead>Types</TableHead>
                  <TableHead className="text-right">Asked</TableHead>
                  <TableHead className="text-right">Approved</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">
                    <Loader2 className="h-4 w-4 animate-spin inline" />
                  </TableCell></TableRow>
                )}
                {!isLoading && isError && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8">
                    <div className="space-y-3">
                      <p className="font-medium text-destructive">Recommendations could not be loaded.</p>
                      <p className="text-xs text-muted-foreground">
                        {(error as Error)?.message ?? 'The recommendation queue request failed.'}
                      </p>
                      <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
                    </div>
                  </TableCell></TableRow>
                )}
                {!isLoading && !isError && rows.length === 0 && (
                  <TableRow><TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No recommendations match these filters.
                  </TableCell></TableRow>
                )}
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.includes(r.id)}
                        onCheckedChange={(v) =>
                          setSelectedIds((prev) =>
                            v ? [...prev, r.id] : prev.filter((id) => id !== r.id))
                        }
                        aria-label={`Select ${r.employee_name ?? 'row'}`}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.employee_name ?? '—'}</div>
                      <div className="text-xs text-muted-foreground">{r.employee_code ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.department_name ?? '—'}</div>
                      <div className="text-muted-foreground">{r.business_unit_name ?? '—'}</div>
                    </TableCell>
                    <TableCell className="text-xs">
                      <div>{r.reviewer_name ?? '—'}</div>
                      <div className="text-muted-foreground">{r.reviewer_role.replace('_', ' ')}</div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {(r.type_labels ?? []).map((l) => (
                          <Badge key={l} variant="outline" className="text-[11px]">{l}</Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRecommendationAmount(r.amount_kind, r.amount_value)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatRecommendationAmount(r.approved_amount_kind, r.approved_amount_value)}
                    </TableCell>
                    <TableCell className="text-xs">{r.final_rating ?? '—'}</TableCell>
                    <TableCell>
                      <div className="flex flex-col items-start gap-1">
                        <Badge variant={statusVariant(r.status)}>
                          {RECOMMENDATION_STATUS_LABEL[r.status] ?? r.status}
                        </Badge>
                        {r.source === 'legacy_import' && (
                          <Badge variant="outline" className="text-[10px]">Legacy</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {r.status === 'needs_classification' && (
                          <Button size="sm" variant="ghost" onClick={() => setReclassifyRow(r)}>
                            <Wand2 className="h-4 w-4 mr-1" />Classify
                          </Button>
                        )}
                        <Button size="sm" variant="outline" onClick={() => setDecideRow(r)}>Decide</Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {total} recommendation(s) · page {page + 1} of {pages}
              {isFetching && <Loader2 className="h-3 w-3 animate-spin inline ml-2" />}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <DecideDialog row={decideRow} onClose={() => setDecideRow(null)} />
      <ReclassifyDialog row={reclassifyRow} onClose={() => setReclassifyRow(null)} />
      <LegacyImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        cycleId={cycle.id}
        cycleName={cycle.name}
      />
      <BulkDecideDialog
        open={bulkOpen}
        ids={selectedIds}
        onClose={(done) => { setBulkOpen(false); if (done) setSelectedIds([]); }}
      />
    </div>
  );
}

function DecideDialog({
  row, onClose,
}: { row: RecommendationQueueRow | null; onClose: () => void }) {
  const decide = useDecideRecommendation();
  const [status, setStatus] = useState<RecommendationStatus>('approved');
  const [reason, setReason] = useState('');
  const [amountKind, setAmountKind] = useState<'absolute' | 'percent'>('percent');
  const [amountValue, setAmountValue] = useState('');

  const modified = status === 'approved_modified';
  const amountNum = amountValue.trim() === '' ? null : Number(amountValue);
  const invalid =
    !reason.trim() || (modified && (amountNum == null || Number.isNaN(amountNum) || amountNum < 0));

  return (
    <Dialog open={!!row} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Decide recommendation</DialogTitle></DialogHeader>
        {row && (
          <div className="space-y-4">
            <div className="rounded-md border p-3 text-sm space-y-1">
              <div className="font-medium">{row.employee_name} ({row.employee_code})</div>
              <div className="text-xs text-muted-foreground">
                {(row.type_labels ?? []).join(', ') || 'No type recorded'} · asked{' '}
                {formatRecommendationAmount(row.amount_kind, row.amount_value)}
              </div>
              {row.narrative && <p className="text-xs whitespace-pre-wrap pt-1">{row.narrative}</p>}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">Decision</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as RecommendationStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {DECISIONS.map((s) => (
                    <SelectItem key={s} value={s}>{RECOMMENDATION_STATUS_LABEL[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {modified && (
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Approved amount type</Label>
                  <Select value={amountKind} onValueChange={(v) => setAmountKind(v as 'absolute' | 'percent')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="percent">Percentage</SelectItem>
                      <SelectItem value="absolute">Absolute (₹)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground" htmlFor="dec-amt">Approved amount</Label>
                  <Input id="dec-amt" inputMode="decimal" value={amountValue}
                    onChange={(e) => setAmountValue(e.target.value)} />
                </div>
              </div>
            )}
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground" htmlFor="dec-reason">Reason (required)</Label>
              <Textarea id="dec-reason" rows={3} value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Recorded in the annual review audit trail." />
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={invalid || decide.isPending}
            onClick={() =>
              row && decide.mutate(
                {
                  id: row.id,
                  status,
                  reason: reason.trim(),
                  approvedAmountKind: modified ? amountKind : null,
                  approvedAmountValue: modified ? amountNum : null,
                },
                { onSuccess: () => { setReason(''); setAmountValue(''); onClose(); } },
              )
            }
          >
            {decide.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Record decision
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BulkDecideDialog({
  open, ids, onClose,
}: { open: boolean; ids: string[]; onClose: (done: boolean) => void }) {
  const bulk = useBulkDecideRecommendations();
  const [status, setStatus] = useState<RecommendationStatus>('approved');
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(false); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Bulk decision — {ids.length} recommendation(s)</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Decision</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as RecommendationStatus)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(['approved', 'rejected', 'deferred', 'implemented'] as RecommendationStatus[]).map((s) => (
                  <SelectItem key={s} value={s}>{RECOMMENDATION_STATUS_LABEL[s]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground" htmlFor="bulk-reason">Reason (required)</Label>
            <Textarea id="bulk-reason" rows={3} value={reason}
              onChange={(e) => setReason(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)}>Cancel</Button>
          <Button
            disabled={!reason.trim() || bulk.isPending}
            onClick={() =>
              bulk.mutate({ ids, status, reason: reason.trim() },
                { onSuccess: () => { setReason(''); onClose(true); } })
            }
          >
            {bulk.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default RecommendationsTab;
