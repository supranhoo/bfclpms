/**
 * ADR-259 — KPI detail drawer: definition, scoring scale and the paged
 * mapped-employee table (server-side pagination, max 200 rows per page).
 * Phase 3 adds one-value group entry via a preview-first dialog.
 * ADR-280 — presented as a centered, wide modal (was a right-side sheet):
 * sticky header + action bar, scrollable body, two-column definition layout.
 */
import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, Users } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  useBuConsoleKpiDetail, useBulkRowOverrides,
  type KpiDetailArgs, type BuConsoleEmployeeRow,
} from '@/hooks/useBuConsole';
import { KpiTextBlocks } from '@/components/kpi/KpiText';
import { KpiScoringScale, KpiTypeBadge } from '@/components/review/KpiScoringScale';
import { isMixedScoringGroup, resolveKpiScoringModel } from '@/lib/kpiScoringModel';
import { GroupValueEntryDialog } from './GroupValueEntryDialog';
import { GroupApprovalDialog } from './GroupApprovalDialog';
import { GroupDefinitionEditDialog } from './GroupDefinitionEditDialog';
import { RowOverrideDialog } from './RowOverrideDialog';

interface Props {
  args: KpiDetailArgs | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
  /** ADR-270 — reopen the same node scoped to one variant. */
  onSelectVariant?: (variantKey: string | null) => void;
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(2);

export function KpiDetailDrawer({ args, onPageChange, onClose, onSelectVariant }: Props) {
  const { data, isLoading, error } = useBuConsoleKpiDetail(args);
  const [entryOpen, setEntryOpen] = useState(false);
  const [approveOpen, setApproveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [overrideRow, setOverrideRow] = useState<BuConsoleEmployeeRow | null>(null);
  // ADR-275 — inline bulk tuning: pick rows, set a value, one undoable run.
  const [bulkMode, setBulkMode] = useState(false);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [bulkWeightage, setBulkWeightage] = useState('');
  const [bulkTarget, setBulkTarget] = useState('');
  const [bulkAllowLocked, setBulkAllowLocked] = useState(false);
  const bulkMut = useBulkRowOverrides();
  const def = (data?.definition ?? {}) as Record<string, any>;
  const variantCount = Number(def.variant_count ?? 1);
  const mixedTypes = isMixedScoringGroup(def.uom_types);
  const scoringModel = resolveKpiScoringModel(def as any);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || 200))) : 1;
  const selectedIds = Object.keys(selected).filter((id) => selected[id]);
  const bulkChanges: Record<string, string | null> = {};
  if (bulkWeightage.trim()) bulkChanges.weightage = bulkWeightage.trim();
  if (bulkTarget.trim()) bulkChanges.target_value = bulkTarget.trim();
  const canApplyBulk = selectedIds.length > 0 && Object.keys(bulkChanges).length > 0;

  const applyBulk = () => {
    if (!canApplyBulk) return;
    bulkMut.mutate(
      {
        rows: selectedIds.map((kpi_id) => ({ kpi_id, changes: bulkChanges })),
        allowLocked: bulkAllowLocked,
      },
      {
        onSuccess: () => {
          setSelected({});
          setBulkWeightage('');
          setBulkTarget('');
        },
      },
    );
  };

  return (
    <Dialog open={!!args} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[92vh] w-[96vw] max-w-[1180px] flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-1 border-b bg-muted/30 px-6 py-4 text-left">
          <DialogTitle className="pr-10 text-lg font-semibold leading-snug">
            {args?.kpiTitle || def.kpi_title || args?.kpiName || 'KPI'}
          </DialogTitle>
          <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
            <span className="truncate">{args?.kraName}</span>
            <span aria-hidden>·</span>
            <span>{args?.period} {args?.year}</span>
            {data?.authorized && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium text-foreground">
                <Users className="h-3 w-3" aria-hidden />
                {data.total} mapped
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
        {data?.authorized && (variantCount > 1 || args?.variantKey) && (
          <div className="mt-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            <p className="font-medium">
              {args?.variantKey
                ? 'Scoped to one variant of this KPI.'
                : `${variantCount} definition variants sit behind this title.`}
            </p>
            <p className="mt-1 text-muted-foreground">
              Group actions below apply to every row currently shown
              {args?.variantKey ? ' in this variant' : ' across all variants'}.
            </p>
            {args?.variantKey && onSelectVariant && (
              <Button
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={() => onSelectVariant(null)}
              >
                Show all variants
              </Button>
            )}
          </div>
        )}

        {data?.authorized && mixedTypes && (
          <div className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
            <p className="font-medium">This title is set up with more than one KPI type.</p>
            <p className="mt-1 text-muted-foreground">
              Types in scope: {(def.uom_types as string[]).join(', ')}. Group value entry is
              disabled — one value cannot mean a number and a Yes/No answer at the same time.
            </p>
          </div>
        )}

        {data?.authorized && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button
              size="sm"
              onClick={() => setEntryOpen(true)}
              disabled={!args || data.total === 0 || mixedTypes}
              title={mixedTypes ? 'Mixed KPI types in this group' : undefined}
            >
              Enter value for all {data.total} employees
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setApproveOpen(true)}
              disabled={!args || data.total === 0}
            >
              Group approve stage
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditOpen(true)}
              disabled={!args || data.total === 0}
            >
              Edit definition for all {data.total}
            </Button>
            <Button
              size="sm"
              variant={bulkMode ? 'default' : 'outline'}
              onClick={() => { setBulkMode((v) => !v); setSelected({}); }}
              disabled={!args || data.total === 0}
            >
              {bulkMode ? 'Done tuning' : 'Tune several employees'}
            </Button>
          </div>
        )}

        {isLoading && (
          <div className="mt-6 space-y-2">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-9 w-full" />)}
          </div>
        )}

        {error && (
          <p className="mt-6 text-sm text-destructive">
            Could not load this KPI. {(error as Error).message}
          </p>
        )}

        {data && !data.authorized && (
          <p className="mt-6 text-sm text-muted-foreground">
            You do not have access to this console.
          </p>
        )}

        {data?.authorized && (
          <div className="mt-6 space-y-6">
            <section className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
              <Meta label="Unit" value={def.uom} />
              <Meta label="Frequency" value={def.frequency} />
              <Meta label="Cycle anchor" value={def.frequency_cycle_start} />
              {def.frequency === 'Daily' && <Meta label="Day counting" value={def.day_count_type} />}
              {def.is_org_level && <Meta label="Org-level scope" value={def.org_level_scope || 'organization'} />}
              <Meta label="Variants" value={String(variantCount)} />
              <div>
                <p className="text-xs uppercase text-muted-foreground">KPI type</p>
                <div className="mt-0.5"><KpiTypeBadge kpi={def as any} /></div>
              </div>
            </section>

            <section className="rounded-md border p-3">
              <KpiTextBlocks
                kpi={{
                  kpi_name: def.kpi_name ?? args?.kpiName ?? '',
                  kpi_title: def.kpi_title ?? null,
                  kpi_description: def.kpi_description ?? null,
                  kpi_formula: def.kpi_formula ?? null,
                  kpi_scoring_logic: def.kpi_scoring_logic ?? null,
                }}
              />
            </section>

            <section>
              <KpiScoringScale kpi={def as any} />
            </section>

            <section>
              {bulkMode && (
                <div className="mb-3 space-y-3 rounded-md border p-3">
                  <p className="text-xs text-muted-foreground">
                    Values entered here are saved as individual overrides for the selected
                    employees only, in one run you can undo. Leave a box blank to keep it as-is.
                  </p>
                  <div className="grid gap-2 sm:grid-cols-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Weightage</Label>
                      <Input
                        value={bulkWeightage}
                        inputMode="decimal"
                        placeholder="unchanged"
                        onChange={(e) => setBulkWeightage(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Target</Label>
                      <Input
                        value={bulkTarget}
                        inputMode="decimal"
                        placeholder="unchanged"
                        onChange={(e) => setBulkTarget(e.target.value)}
                      />
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <Label className="text-xs">Include rows in review</Label>
                        <p className="text-[11px] text-muted-foreground">Approved scores stay immutable.</p>
                      </div>
                      <Switch checked={bulkAllowLocked} onCheckedChange={setBulkAllowLocked} />
                    </div>
                  </div>
                  <Button size="sm" onClick={applyBulk} disabled={!canApplyBulk || bulkMut.isPending}>
                    {bulkMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save for {selectedIds.length} selected
                  </Button>
                </div>
              )}

              <div className="mb-2 flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  Mapped employees <Badge variant="secondary">{data.total}</Badge>
                </h3>
                {totalPages > 1 && (
                  <div className="flex items-center gap-2 text-xs">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.page <= 1}
                      onClick={() => onPageChange(data.page - 1)}
                    >
                      Previous
                    </Button>
                    <span>Page {data.page} of {totalPages}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={data.page >= totalPages}
                      onClick={() => onPageChange(data.page + 1)}
                    >
                      Next
                    </Button>
                  </div>
                )}
              </div>

              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {bulkMode && (
                        <TableHead className="w-[36px]">
                          <Checkbox
                            checked={data.rows.length > 0 && data.rows.every((r) => selected[r.kpi_id])}
                            onCheckedChange={(v) => {
                              const next: Record<string, boolean> = { ...selected };
                              data.rows.forEach((r) => { next[r.kpi_id] = v === true; });
                              setSelected(next);
                            }}
                            aria-label="Select all rows on this page"
                          />
                        </TableHead>
                      )}
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      {variantCount > 1 && <TableHead>Variant</TableHead>}
                      <TableHead className="text-right">Weightage</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-[70px]" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map(r => (
                      <TableRow key={r.kpi_id}>
                        {bulkMode && (
                          <TableCell>
                            <Checkbox
                              checked={!!selected[r.kpi_id]}
                              onCheckedChange={(v) =>
                                setSelected((prev) => ({ ...prev, [r.kpi_id]: v === true }))
                              }
                              aria-label={`Select ${r.employee_name ?? 'employee'}`}
                            />
                          </TableCell>
                        )}
                        <TableCell className="font-medium">
                          {r.employee_name ?? '—'}
                          {r.employee_code && (
                            <span className="ml-1 text-xs text-muted-foreground">({r.employee_code})</span>
                          )}
                          {(r.override_fields?.length ?? 0) > 0 && (
                            <Badge variant="secondary" className="ml-1 text-[10px]">
                              tuned ({r.override_fields.length})
                            </Badge>
                          )}
                          {r.frequency_cycle_start && (
                            <span className="ml-1 text-[10px] text-muted-foreground">
                              {r.frequency_cycle_start}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{r.department_name ?? '—'}</TableCell>
                        {variantCount > 1 && (
                          <TableCell>
                            <Badge variant="outline" className="font-mono text-[10px]">
                              {(r.variant_key ?? '—').slice(0, 6)}
                            </Badge>
                          </TableCell>
                        )}
                        <TableCell className="text-right">{fmt(r.weightage)}</TableCell>
                        <TableCell className="text-right">{fmt(r.target_value)}</TableCell>
                        <TableCell className="text-right">{r.is_na ? 'N/A' : fmt(r.achieved_value)}</TableCell>
                        <TableCell className="text-right">
                          {fmt(r.final_score ?? r.manager_score ?? r.self_score)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{r.status ?? '—'}</Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" variant="ghost" onClick={() => setOverrideRow(r)}>
                            Tune
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                    {data.rows.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={(variantCount > 1 ? 9 : 8) + (bulkMode ? 1 : 0)}
                          className="text-center text-sm text-muted-foreground"
                        >
                          No mapped employees in this scope.
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              </div>
            </section>
          </div>
        )}
      </SheetContent>
      <GroupValueEntryDialog
        args={args}
        open={entryOpen}
        onOpenChange={setEntryOpen}
        scoringModel={scoringModel}
      />
      <GroupApprovalDialog args={args} open={approveOpen} onOpenChange={setApproveOpen} />
      <GroupDefinitionEditDialog
        args={args}
        definition={def}
        open={editOpen}
        onOpenChange={setEditOpen}
      />
      <RowOverrideDialog
        row={overrideRow}
        open={!!overrideRow}
        onOpenChange={(o) => !o && setOverrideRow(null)}
      />
    </Sheet>
  );
}

function Meta({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-medium">{value || '—'}</p>
    </div>
  );
}