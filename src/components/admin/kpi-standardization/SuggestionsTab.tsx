import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import {
  Sparkles, RefreshCw, GitMerge, Wand2, X, ArrowRight, AlertTriangle,
} from 'lucide-react';
import {
  useRegistrySuggestions,
  useDismissSuggestion,
  useMergeDefinitions,
  type DefinitionMergeSuggestion,
  type AliasCandidateSuggestion,
} from '@/hooks/useRegistrySuggestions';
import { usePromoteSignature } from '@/hooks/useCanonicalAutolink';
import { format } from 'date-fns';

/**
 * Phase 4b: Auto-merge suggestion review surface.
 *
 * Two sections:
 *   - Definition merge candidates (uses ConfirmDestructiveDialog because
 *     merging a definition is destructive — the dropped definition will be
 *     removed in Phase 4c via the `merge_definitions` RPC).
 *   - Alias promotion candidates (non-destructive: adds a variant alias
 *     under an existing canonical definition via promote_signature_to_definition).
 *
 * All actions are admin-only at the DB layer; this UI also gates by route
 * (/admin/...). Dismissals are idempotent per (kind, left_id, right_id).
 */
export function SuggestionsTab() {
  const {
    defMerges, aliasCandidates, loading, error, refresh,
    defMergeThreshold, aliasThreshold,
    setDefMergeThreshold, setAliasThreshold,
  } = useRegistrySuggestions();
  const { dismiss, loading: dismissing } = useDismissSuggestion();
  const { promote, loading: promoting } = usePromoteSignature();
  const { merge, loading: merging } = useMergeDefinitions();

  // Phase 4c: Live merge confirmation. `keepLeft` lets the admin pick which
  // side of the pair survives; the UI defaults to the side with more aliases /
  // linked KPIs, but always lets the admin flip it before confirming.
  const [pendingMerge, setPendingMerge] = useState<DefinitionMergeSuggestion | null>(null);
  const [keepLeft, setKeepLeft] = useState(true);

  const openMergeDialog = (row: DefinitionMergeSuggestion) => {
    const leftScore = row.left_alias_count + row.left_linked_kpi_count;
    const rightScore = row.right_alias_count + row.right_linked_kpi_count;
    setKeepLeft(leftScore >= rightScore);
    setPendingMerge(row);
  };

  const confirmMerge = async () => {
    if (!pendingMerge) return;
    const keepId = keepLeft ? pendingMerge.left_id : pendingMerge.right_id;
    const dropId = keepLeft ? pendingMerge.right_id : pendingMerge.left_id;
    const result = await merge(keepId, dropId, 'merged via Suggestions tab');
    setPendingMerge(null);
    if (result) void refresh();
  };

  const totalSuggestions = defMerges.length + aliasCandidates.length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            Auto-Merge Suggestions
          </h2>
          <p className="text-xs text-muted-foreground">
            Fuzzy-matched candidates for merging duplicate definitions or promoting unlinked signatures into existing canonical entries. All actions require explicit confirmation; nothing happens automatically.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="font-normal">
            {loading ? '…' : `${totalSuggestions} open`}
          </Badge>
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Card className="border-destructive/50 bg-destructive/5">
          <CardContent className="py-3 text-sm text-destructive">
            Could not load suggestions: {error}
          </CardContent>
        </Card>
      )}

      {/* Threshold controls */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Match Sensitivity</CardTitle>
          <CardDescription>
            Lower thresholds surface more borderline candidates. Defaults are tuned to balance noise vs coverage.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-5 md:grid-cols-2">
          <ThresholdSlider
            id="def-merge-threshold"
            label="Definition merge similarity"
            help="Higher = stricter. Two canonical definitions must look this similar to be flagged."
            value={defMergeThreshold}
            onChange={setDefMergeThreshold}
          />
          <ThresholdSlider
            id="alias-threshold"
            label="Alias candidate similarity"
            help="Higher = stricter. Unlinked signatures must look this similar to a canonical definition."
            value={aliasThreshold}
            onChange={setAliasThreshold}
          />
        </CardContent>
      </Card>

      {/* Definition merge candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <GitMerge className="h-4 w-4 text-amber-600" />
            Definition Merge Candidates
          </CardTitle>
          <CardDescription>
            Pairs of canonical definitions in the same category whose names are nearly identical. Review carefully before merging — the dropped definition's aliases and KPI links will be re-parented to the surviving definition.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SkeletonRows />
          ) : defMerges.length === 0 ? (
            <EmptyState message="No merge candidates at the current similarity threshold." />
          ) : (
            <div className="rounded-md border overflow-auto max-h-[520px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Definition A</TableHead>
                    <TableHead className="text-xs">Definition B</TableHead>
                    <TableHead className="text-xs text-right">Similarity</TableHead>
                    <TableHead className="text-xs text-right">Aliases (A / B)</TableHead>
                    <TableHead className="text-xs text-right">Linked KPIs (A / B)</TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {defMerges.map((row) => (
                    <TableRow key={`${row.left_id}-${row.right_id}`}>
                      <TableCell className="text-xs text-muted-foreground">{row.category_name}</TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{row.left_kra_name}</div>
                        <div className="text-muted-foreground">{row.left_kpi_name}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        <div className="font-medium">{row.right_kra_name}</div>
                        <div className="text-muted-foreground">{row.right_kpi_name}</div>
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        <SimilarityBadge value={row.similarity} />
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.left_alias_count} / {row.right_alias_count}
                      </TableCell>
                      <TableCell className="text-xs text-right tabular-nums">
                        {row.left_linked_kpi_count} / {row.right_linked_kpi_count}
                      </TableCell>
                      <TableCell className="text-xs text-right whitespace-nowrap">
                        <div className="inline-flex gap-1.5">
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={merging}
                            onClick={() => openMergeDialog(row)}
                          >
                            <GitMerge className="h-3 w-3 mr-1" />
                            Merge
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 text-xs"
                            disabled={dismissing}
                            onClick={async () => {
                              const ok = await dismiss('definition_merge', row.left_id, row.right_id);
                              if (ok) void refresh();
                            }}
                          >
                            <X className="h-3 w-3 mr-1" />
                            Dismiss
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alias candidates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Wand2 className="h-4 w-4 text-primary" />
            Alias Promotion Candidates
          </CardTitle>
          <CardDescription>
            Unlinked KPI signatures (May 2026+) whose text closely resembles an existing canonical definition. Promoting adds the signature as a variant alias and back-links matching KPI rows; it does not modify historical text.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <SkeletonRows />
          ) : aliasCandidates.length === 0 ? (
            <EmptyState message="No alias candidates at the current similarity threshold." />
          ) : (
            <div className="rounded-md border overflow-auto max-h-[520px]">
              <Table>
                <TableHeader className="sticky top-0 bg-background z-10">
                  <TableRow>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs">Unlinked Signature</TableHead>
                    <TableHead className="text-xs"></TableHead>
                    <TableHead className="text-xs">Best-Match Canonical</TableHead>
                    <TableHead className="text-xs text-right">Similarity</TableHead>
                    <TableHead className="text-xs text-right">Occurrences</TableHead>
                    <TableHead className="text-xs whitespace-nowrap">Last Seen</TableHead>
                    <TableHead className="text-xs text-right whitespace-nowrap">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {aliasCandidates.map((row) => (
                    <AliasCandidateRow
                      key={`${row.signature_id}-${row.definition_id}`}
                      row={row}
                      onPromote={async () => {
                        const result = await promote(
                          row.category_id,
                          row.signature_kra_name,
                          row.signature_kpi_name,
                          row.canonical_kra_name,
                          row.canonical_kpi_name,
                        );
                        if (result) void refresh();
                      }}
                      onDismiss={async () => {
                        const ok = await dismiss('alias_candidate', row.signature_id, row.definition_id);
                        if (ok) void refresh();
                      }}
                      busy={promoting || dismissing}
                    />
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Phase 4c: live merge confirmation. */}
      <ConfirmDestructiveDialog
        open={!!pendingMerge}
        onCancel={() => setPendingMerge(null)}
        onConfirm={() => void confirmMerge()}
        title="Merge canonical definitions"
        description={
          pendingMerge
            ? buildMergeDescription(pendingMerge, keepLeft)
            : ''
        }
        confirmLabel="Merge definitions"
        isLoading={merging}
      />
    </div>
  );
}

function buildMergeDescription(row: DefinitionMergeSuggestion, keepLeft: boolean): string {
  const kept = keepLeft
    ? `${row.left_kra_name} / ${row.left_kpi_name}`
    : `${row.right_kra_name} / ${row.right_kpi_name}`;
  const dropped = keepLeft
    ? `${row.right_kra_name} / ${row.right_kpi_name}`
    : `${row.left_kra_name} / ${row.left_kpi_name}`;
  return `This will permanently delete the canonical definition "${dropped}" and re-parent its aliases and linked KPIs to "${kept}". The action is logged in the registry audit log and cannot be undone.`;
}

function ThresholdSlider({
  id, label, help, value, onChange,
}: {
  id: string;
  label: string;
  help: string;
  value: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <Label htmlFor={id} className="text-xs font-medium">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {(value * 100).toFixed(0)}%
        </span>
      </div>
      <Slider
        id={id}
        min={0.3}
        max={0.95}
        step={0.05}
        value={[value]}
        onValueChange={(v) => onChange(v[0] ?? value)}
      />
      <p className="text-[11px] text-muted-foreground">{help}</p>
    </div>
  );
}

function SimilarityBadge({ value }: { value: number }) {
  const pct = Math.round(value * 100);
  const tone = pct >= 85
    ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30'
    : pct >= 70
    ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
    : 'bg-muted text-muted-foreground border-border';
  return (
    <Badge variant="outline" className={`font-normal tabular-nums ${tone}`}>{pct}%</Badge>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <p className="text-sm text-muted-foreground italic py-6 text-center">{message}</p>
  );
}

function SkeletonRows() {
  return (
    <div className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
    </div>
  );
}

function AliasCandidateRow({
  row, onPromote, onDismiss, busy,
}: {
  row: AliasCandidateSuggestion;
  onPromote: () => void;
  onDismiss: () => void;
  busy: boolean;
}) {
  const renamed = useMemo(
    () =>
      row.signature_kra_name !== row.canonical_kra_name ||
      row.signature_kpi_name !== row.canonical_kpi_name,
    [row.signature_kra_name, row.signature_kpi_name, row.canonical_kra_name, row.canonical_kpi_name],
  );

  return (
    <TableRow>
      <TableCell className="text-xs text-muted-foreground">{row.category_name}</TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{row.signature_kra_name}</div>
        <div className="text-muted-foreground">{row.signature_kpi_name}</div>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        <ArrowRight className="h-3 w-3" />
      </TableCell>
      <TableCell className="text-xs">
        <div className="font-medium">{row.canonical_kra_name}</div>
        <div className="text-muted-foreground">{row.canonical_kpi_name}</div>
        {renamed && (
          <div className="mt-0.5 inline-flex items-center gap-1 text-[10px] text-amber-600">
            <AlertTriangle className="h-3 w-3" />
            Different text from signature
          </div>
        )}
      </TableCell>
      <TableCell className="text-xs text-right tabular-nums">
        <SimilarityBadge value={row.similarity} />
      </TableCell>
      <TableCell className="text-xs text-right tabular-nums">{row.occurrence_count}</TableCell>
      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
        {row.last_seen ? format(new Date(row.last_seen), 'dd MMM yyyy') : '—'}
      </TableCell>
      <TableCell className="text-xs text-right whitespace-nowrap">
        <div className="inline-flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-xs" disabled={busy} onClick={onPromote}>
            <Wand2 className="h-3 w-3 mr-1" />
            Promote
          </Button>
          <Button size="sm" variant="ghost" className="h-7 text-xs" disabled={busy} onClick={onDismiss}>
            <X className="h-3 w-3 mr-1" />
            Dismiss
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}