/**
 * ADR-269 — KPI Text Split (FY 2026-27 onward).
 * Preview / apply / manually correct the Title-Description-Formula-Scoring
 * split. Legacy assessment years are excluded server-side and cannot be
 * reached from this screen.
 */
import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { ChevronLeft, ChevronRight, Pencil, PlayCircle, Undo2 } from 'lucide-react';
import {
  useApplyKpiSplit,
  useKpiSplitPreview,
  useKpiSplitSummary,
  useRollbackKpiSplit,
  useSaveKpiParts,
  type KpiSplitPreviewRow,
} from '@/hooks/useKpiTextSplit';
import type { KpiSplitConfidence } from '@/lib/kpiTextSplit';

const PAGE_SIZE = 25;

const CONF_LABEL: Record<string, string> = {
  high: 'Clean split',
  review: 'Needs review',
  unparsed: 'No markers',
  empty: 'Empty',
};

function ConfidenceBadge({ value }: { value: string }) {
  return (
    <Badge variant={value === 'high' ? 'default' : value === 'review' ? 'secondary' : 'outline'}>
      {CONF_LABEL[value] ?? value}
    </Badge>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </div>
  );
}

export function TextSplitTab() {
  const [confidence, setConfidence] = useState<KpiSplitConfidence | 'all'>('high');
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<KpiSplitPreviewRow | null>(null);
  const [lastRunId, setLastRunId] = useState<string | null>(null);

  const summary = useKpiSplitSummary();
  const preview = useKpiSplitPreview({ page, pageSize: PAGE_SIZE, confidence });
  const apply = useApplyKpiSplit();
  const rollback = useRollbackKpiSplit();
  const save = useSaveKpiParts();

  const rows = preview.data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const pages = Math.max(1, Math.ceil(Number(total) / PAGE_SIZE));

  const runApply = () => {
    apply.mutate(
      { confidence: 'high', limit: 5000 },
      {
        onSuccess: (res) => {
          setLastRunId(res.run_id);
          toast.success(`Split applied to ${res.applied} KPI${res.applied === 1 ? '' : 's'}`, {
            description: 'Original KPI name text was not modified.',
          });
        },
        onError: (e: unknown) => toast.error('Could not apply the split', { description: (e as Error).message }),
      },
    );
  };

  const runRollback = () => {
    if (!lastRunId) return;
    rollback.mutate(lastRunId, {
      onSuccess: (res) => {
        toast.success(`Reverted ${res.reverted} KPI${res.reverted === 1 ? '' : 's'}`);
        setLastRunId(null);
      },
      onError: (e: unknown) => toast.error('Rollback failed', { description: (e as Error).message }),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Structured KPI text — July 2026 onward</CardTitle>
          <CardDescription>
            Splits each KPI's text into Title, Description, Formula and Scoring Logic for the new
            assessment year only. Earlier assessment years are untouched, and the original KPI name
            is never modified, so review, scoring and Org KPI matching are unaffected.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {summary.isLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : summary.data ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="In scope (FY 2026-27+)" value={summary.data.in_scope} />
              <Stat label="Distinct names" value={summary.data.distinct_names} />
              <Stat label="Clean split" value={summary.data.high} />
              <Stat label="Needs review" value={summary.data.review} />
              <Stat label="No markers" value={summary.data.unparsed} />
              <Stat label="Legacy untouched" value={summary.data.legacy_untouched} />
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={runApply} disabled={apply.isPending}>
              <PlayCircle className="mr-2 h-4 w-4" />
              {apply.isPending ? 'Applying…' : 'Apply clean splits'}
            </Button>
            <Button variant="outline" onClick={runRollback} disabled={!lastRunId || rollback.isPending}>
              <Undo2 className="mr-2 h-4 w-4" />
              Undo last run
            </Button>
            {summary.data ? (
              <span className="text-xs text-muted-foreground">
                {summary.data.already_split} already structured
              </span>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3 space-y-0 pb-3">
          <div>
            <CardTitle className="text-base">Preview</CardTitle>
            <CardDescription>{Number(total)} row{Number(total) === 1 ? '' : 's'} in this filter</CardDescription>
          </div>
          <Select
            value={confidence}
            onValueChange={(v) => {
              setConfidence(v as KpiSplitConfidence | 'all');
              setPage(0);
            }}
          >
            <SelectTrigger className="h-9 w-[170px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="high">Clean split</SelectItem>
              <SelectItem value="review">Needs review</SelectItem>
              <SelectItem value="unparsed">No markers</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
        </CardHeader>
        <CardContent className="space-y-3">
          {preview.isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : rows.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">No KPIs match this filter.</p>
          ) : (
            rows.map((r) => (
              <div key={r.kpi_id} className="rounded-lg border p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">
                      {r.title ?? <span className="text-destructive">No title detected</span>}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {r.kra_name} · {r.review_period} {r.review_year}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {r.already_split ? <Badge variant="outline">Structured</Badge> : null}
                    <ConfidenceBadge value={r.confidence} />
                    <Button size="sm" variant="ghost" onClick={() => setEditing(r)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <dl className="mt-2 grid gap-1 text-xs sm:grid-cols-3">
                  <div>
                    <dt className="font-medium text-muted-foreground">Description</dt>
                    <dd className="whitespace-pre-wrap">{r.description ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Formula</dt>
                    <dd className="whitespace-pre-wrap">{r.formula ?? '—'}</dd>
                  </div>
                  <div>
                    <dt className="font-medium text-muted-foreground">Scoring Logic</dt>
                    <dd className="whitespace-pre-wrap">{r.scoring_logic ?? '—'}</dd>
                  </div>
                </dl>
              </div>
            ))
          )}

          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">
              Page {page + 1} of {pages}
            </span>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={page + 1 >= pages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <EditPartsDialog
        row={editing}
        onClose={() => setEditing(null)}
        onSave={(parts) => {
          if (!editing) return;
          save.mutate(
            { kpiId: editing.kpi_id, ...parts },
            {
              onSuccess: () => {
                toast.success('Structured text saved');
                setEditing(null);
              },
              onError: (e: unknown) => toast.error('Save failed', { description: (e as Error).message }),
            },
          );
        }}
        saving={save.isPending}
      />
    </div>
  );
}

function EditPartsDialog({
  row,
  onClose,
  onSave,
  saving,
}: {
  row: KpiSplitPreviewRow | null;
  onClose: () => void;
  onSave: (p: { title: string | null; description: string | null; formula: string | null; scoring_logic: string | null }) => void;
  saving: boolean;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [formula, setFormula] = useState('');
  const [scoring, setScoring] = useState('');
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  if (row && loadedFor !== row.kpi_id) {
    setLoadedFor(row.kpi_id);
    setTitle(row.title ?? '');
    setDescription(row.description ?? '');
    setFormula(row.formula ?? '');
    setScoring(row.scoring_logic ?? '');
  }

  return (
    <Dialog open={!!row} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit structured KPI text</DialogTitle>
          <DialogDescription>
            Saves the four structured fields only. The original KPI name text stays exactly as it is.
          </DialogDescription>
        </DialogHeader>

        {row ? (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap">{row.kpi_name}</div>
            <div className="space-y-1">
              <Label htmlFor="split-title">Title</Label>
              <Input id="split-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="split-desc">Description</Label>
              <Textarea id="split-desc" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="split-formula">Formula</Label>
              <Textarea id="split-formula" rows={2} value={formula} onChange={(e) => setFormula(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="split-scoring">Scoring Logic</Label>
              <Textarea id="split-scoring" rows={3} value={scoring} onChange={(e) => setScoring(e.target.value)} />
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={saving || !title.trim()}
            onClick={() =>
              onSave({
                title: title.trim() || null,
                description: description.trim() || null,
                formula: formula.trim() || null,
                scoring_logic: scoring.trim() || null,
              })
            }
          >
            {saving ? 'Saving…' : 'Save'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
