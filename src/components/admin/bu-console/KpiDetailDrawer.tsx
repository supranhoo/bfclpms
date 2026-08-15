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
import { GroupValueEntryDialog } from './GroupValueEntryDialog';

interface Props {
  args: KpiDetailArgs | null;
  onPageChange: (page: number) => void;
  onClose: () => void;
}

const fmt = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Number(v).toFixed(2);

export function KpiDetailDrawer({ args, onPageChange, onClose }: Props) {
  const { data, isLoading, error } = useBuConsoleKpiDetail(args);
  const [entryOpen, setEntryOpen] = useState(false);
  const def = (data?.definition ?? {}) as Record<string, string | null>;
  const totalPages = data ? Math.max(1, Math.ceil(data.total / (data.page_size || 200))) : 1;

  return (
    <Sheet open={!!args} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="right" className="w-full sm:max-w-3xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="pr-8">{args?.kpiName ?? 'KPI'}</SheetTitle>
          <SheetDescription>
            {args?.kraName} · {args?.period} {args?.year}
          </SheetDescription>
        </SheetHeader>

        {data?.authorized && (
          <div className="mt-4">
            <Button size="sm" onClick={() => setEntryOpen(true)} disabled={!args || data.total === 0}>
              Enter value for all {data.total} employees
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
              <Meta label="Criteria" value={def.criteria} />
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold">Scoring scale</h3>
              <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                {(['r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const).map(k => (
                  <div key={k} className="rounded-md border p-2">
                    <p className="font-medium uppercase text-muted-foreground">{k}</p>
                    <p>{def[k] ?? '—'}</p>
                  </div>
                ))}
              </div>
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
                        <TableCell colSpan={7} className="text-center text-sm text-muted-foreground">
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
      <GroupValueEntryDialog args={args} open={entryOpen} onOpenChange={setEntryOpen} />
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