/**
 * ADR-259 — KPI detail drawer: definition, scoring scale and the paged
 * mapped-employee table (server-side pagination, max 200 rows per page).
 * Phase 3 adds one-value group entry via a preview-first dialog.
 */
import { useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useBuConsoleKpiDetail, type KpiDetailArgs } from '@/hooks/useBuConsole';
import { KpiTextBlocks } from '@/components/kpi/KpiText';
import { KpiScoringScale, KpiTypeBadge } from '@/components/review/KpiScoringScale';
import { isMixedScoringGroup, resolveKpiScoringModel } from '@/lib/kpiScoringModel';
import { GroupValueEntryDialog } from './GroupValueEntryDialog';
import { GroupApprovalDialog } from './GroupApprovalDialog';

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
  const def = (data?.definition ?? {}) as Record<string, any>;
  const variantCount = Number(def.variant_count ?? 1);
  const mixedTypes = isMixedScoringGroup(def.uom_types);
  const scoringModel = resolveKpiScoringModel(def as any);
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || 200))) : 1;

  return (
    <Sheet open={!!args} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">
            {args?.kpiTitle || def.kpi_title || args?.kpiName || 'KPI'}
          </SheetTitle>
          <SheetDescription>
            {args?.kraName} · {args?.period} {args?.year}
          </SheetDescription>
        </SheetHeader>

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
                      <TableHead>Employee</TableHead>
                      <TableHead>Department</TableHead>
                      {variantCount > 1 && <TableHead>Variant</TableHead>}
                      <TableHead className="text-right">Weightage</TableHead>
                      <TableHead className="text-right">Target</TableHead>
                      <TableHead className="text-right">Actual</TableHead>
                      <TableHead className="text-right">Score</TableHead>
                      <TableHead>Stage</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.rows.map(r => (
                      <TableRow key={r.kpi_id}>
                        <TableCell className="font-medium">
                          {r.employee_name ?? '—'}
                          {r.employee_code && (
                            <span className="ml-1 text-xs text-muted-foreground">({r.employee_code})</span>
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
                      </TableRow>
                    ))}
                    {data.rows.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={variantCount > 1 ? 8 : 7} className="text-center text-sm text-muted-foreground">
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