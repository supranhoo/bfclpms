import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Download, Eye, Search, ShieldAlert, SlidersHorizontal, X } from 'lucide-react';
import {
  DEFAULT_RATING_SLABS, formatRating5, formatSlabPercent, resolveSlabPercent, type RatingSlab,
} from '@/lib/annualReview/ratingSlab';
import { computedRating, isCalibrated } from '@/lib/annualReview/effectiveRating';
import type { BandEmployee } from '@/lib/annualReview/bellCurve';
import { CalibrateRatingDialog, type CalibrationTarget } from '@/components/annual-review/CalibrateRatingDialog';
import { ReviewFormViewerDialog } from '@/components/annual-review/ReviewFormViewerDialog';
import {
  ELIGIBILITY_STATUS_LABELS, effectiveSlabPercent, eligibilitySummary,
  isSlabCapped, type EffectiveEligibility, type SlabCapOptions,
} from '@/lib/annualReview/effectiveEligibility';
import { ExemptionDialog } from './ExemptionDialog';

const PAGE_SIZE = 25;

function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function targetOf(e: BandEmployee): CalibrationTarget {
  return {
    instance_id: e.instance_id,
    employee_name: e.employee_name,
    employee_code: e.employee_code,
    computed_rating: computedRating(e),
    calibrated_rating: e.calibrated_rating ?? null,
  };
}

/**
 * ADR-218c / ADR-218d — employees behind a single heat map cell.
 * ADR-220 adds admin-only single and bulk calibration of the final rating.
 */
export function BandEmployeeList({
  employees, groupName, bandLabel, bandSub, slabs = DEFAULT_RATING_SLABS, canCalibrate = false,
  eligibilityOf, canManageExemptions = false, canApproveExemptions = false, capOptions, onClose,
}: {
  employees: BandEmployee[];
  groupName: string;
  bandLabel: string;
  bandSub: string;
  slabs?: ReadonlyArray<RatingSlab>;
  canCalibrate?: boolean;
  /** ADR-221 — effective eligibility resolver for a drill-down row. */
  eligibilityOf?: (e: BandEmployee) => EffectiveEligibility | null;
  canManageExemptions?: boolean;
  canApproveExemptions?: boolean;
  /** ADR-222 — exemption increment cap settings from the bell curve config. */
  capOptions?: SlabCapOptions;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [dialogTargets, setDialogTargets] = useState<CalibrationTarget[] | null>(null);
  const [viewInstanceId, setViewInstanceId] = useState<string | null>(null);
  const [exemptionFor, setExemptionFor] = useState<BandEmployee | null>(null);

  const cap: SlabCapOptions = { slabs, ...(capOptions ?? {}) };

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return employees;
    return employees.filter((e) =>
      (e.employee_name ?? '').toLowerCase().includes(q)
      || (e.employee_code ?? '').toLowerCase().includes(q));
  }, [employees, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);
  const colCount = 9 + (canCalibrate ? 2 : 0) + (canManageExemptions ? 1 : 0);

  const exportCsv = () => {
    const header = [
      'Employee Code', 'Name', 'Grade', 'Manager',
      'Rating Given by Dept', 'Rating Given by BU', 'Slab %',
      'Computed Rating', 'Calibrated Rating', 'Calibration Reason', 'Eligibility', 'Exemption Cap Applied',
    ];
    const lines = [header.join(',')];
    for (const e of visible) {
      const elig = eligibilityOf?.(e) ?? null;
      const status = elig?.status ?? 'unknown';
      const raw = resolveSlabPercent(e.rating, slabs);
      const pct = effectiveSlabPercent(raw, status, cap);
      const comp = computedRating(e);
      lines.push([
        e.employee_code, e.employee_name, e.grade ?? '', e.manager_name ?? '',
        e.dept_head_rating_5 === null || e.dept_head_rating_5 === undefined ? '' : Number(e.dept_head_rating_5).toFixed(2),
        e.bu_head_rating_5 === null || e.bu_head_rating_5 === undefined ? '' : Number(e.bu_head_rating_5).toFixed(2),
        pct === null ? '' : `${pct}%`,
        comp === null ? '' : comp.toFixed(2),
        isCalibrated(e) ? Number(e.calibrated_rating).toFixed(2) : '',
        e.calibration_reason ?? '',
        elig ? eligibilitySummary(elig) : '',
        isSlabCapped(raw, status, cap) ? 'Yes' : '',
      ].map(csvCell).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${groupName}-${bandLabel}-employees.csv`.replace(/[^\w.-]+/g, '_');
    a.click();
    URL.revokeObjectURL(url);
  };

  const allOnPageSelected = slice.length > 0 && slice.every((e) => selected.includes(e.instance_id));

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">
          {groupName} · {bandLabel}
          <span className="text-muted-foreground font-normal"> ({bandSub}) — {employees.length} employee{employees.length === 1 ? '' : 's'}</span>
        </p>
        <div className="flex items-center gap-2">
          {canCalibrate && selected.length > 0 && (
            <Button
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setDialogTargets(
                employees.filter((e) => selected.includes(e.instance_id)).map(targetOf),
              )}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" /> Calibrate {selected.length}
            </Button>
          )}
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              placeholder="Search name or code…"
              aria-label="Search employees in band"
              className="h-8 w-[200px] pl-7 text-sm"
            />
          </div>
          <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={exportCsv}>
            <Download className="h-3.5 w-3.5" /> CSV
          </Button>
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" aria-label="Close employee list" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              {canCalibrate && (
                <th className="w-8 p-2">
                  <Checkbox
                    checked={allOnPageSelected}
                    aria-label="Select all employees on this page"
                    onCheckedChange={(v) => setSelected((s) => (
                      v
                        ? Array.from(new Set([...s, ...slice.map((e) => e.instance_id)]))
                        : s.filter((id) => !slice.some((e) => e.instance_id === id))
                    ))}
                  />
                </th>
              )}
              <th className="p-2 text-left font-medium">Code</th>
              <th className="p-2 text-left font-medium">Name</th>
              <th className="p-2 text-left font-medium">Grade</th>
              <th className="p-2 text-left font-medium">Manager</th>
              <th className="p-2 text-right font-medium">Rating Given by Dept</th>
              <th className="p-2 text-right font-medium">Rating Given by BU</th>
              <th className="p-2 text-right font-medium">Slab %</th>
              <th className="p-2 text-left font-medium">Eligibility</th>
              <th className="p-2 text-right font-medium">Form</th>
              {canManageExemptions && <th className="p-2 text-right font-medium">Exemption</th>}
              {canCalibrate && <th className="p-2 text-right font-medium">Calibrate</th>}
            </tr>
          </thead>
          <tbody>
            {slice.map((e) => {
              const elig = eligibilityOf?.(e) ?? null;
              const status = elig?.status ?? 'unknown';
              return (
              <tr key={e.instance_id} className="border-b last:border-0 hover:bg-muted/50">
                {canCalibrate && (
                  <td className="p-2">
                    <Checkbox
                      checked={selected.includes(e.instance_id)}
                      aria-label={`Select ${e.employee_name ?? 'employee'}`}
                      onCheckedChange={(v) => setSelected((s) => (
                        v ? [...s, e.instance_id] : s.filter((id) => id !== e.instance_id)
                      ))}
                    />
                  </td>
                )}
                <td className="p-2 tabular-nums">{e.employee_code ?? '—'}</td>
                <td className="p-2 font-medium">
                  {e.employee_name ?? '—'}
                  {isCalibrated(e) && (
                    <Badge variant="outline" className="ml-2 text-[10px]" title={
                      `Computed ${formatRating5(computedRating(e))} → calibrated ${formatRating5(e.calibrated_rating)}`
                      + (e.calibration_reason ? ` · ${e.calibration_reason}` : '')
                      + (e.calibrated_by_name ? ` · ${e.calibrated_by_name}` : '')
                    }>
                      Calibrated
                    </Badge>
                  )}
                </td>
                <td className="p-2 text-muted-foreground">{e.grade ?? '—'}</td>
                <td className="p-2 text-muted-foreground">{e.manager_name ?? '—'}</td>
                <td className="p-2 text-right tabular-nums">{formatRating5(e.dept_head_rating_5 ?? null)}</td>
                <td className="p-2 text-right tabular-nums">{formatRating5(e.bu_head_rating_5 ?? null)}</td>
                <td className="p-2 text-right tabular-nums">
                  {(() => {
                    const raw = resolveSlabPercent(e.rating, slabs);
                    const capped = isSlabCapped(raw, status, cap);
                    return (
                      <>
                        {formatSlabPercent(effectiveSlabPercent(raw, status, cap))}
                        {capped && (
                          <Badge
                            variant="outline"
                            className="ml-2 text-[10px]"
                            title={`Exemption cap: top ${cap.topTiersExcluded ?? 0} tier(s) excluded — computed ${formatSlabPercent(raw)}`}
                          >
                            Capped
                          </Badge>
                        )}
                      </>
                    );
                  })()}
                </td>
                <td className="p-2">
                  {status === 'unknown' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    <Badge
                      variant={status === 'ineligible' ? 'destructive' : status === 'exempted' ? 'secondary' : 'outline'}
                      className="text-[10px]"
                      title={elig ? eligibilitySummary(elig) : undefined}
                    >
                      {ELIGIBILITY_STATUS_LABELS[status]}
                      {elig?.hasPendingExemption ? ' · pending' : ''}
                    </Badge>
                  )}
                </td>
                <td className="p-2 text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 text-xs"
                    onClick={() => setViewInstanceId(e.instance_id)}
                  >
                    <Eye className="h-3.5 w-3.5" />
                    <span className="sr-only">View review form for {e.employee_name ?? 'employee'}</span>
                  </Button>
                </td>
                {canManageExemptions && (
                  <td className="p-2 text-right">
                    <Button
                      variant="ghost" size="sm" className="h-8 gap-1 text-xs"
                      disabled={!elig || elig.failures.length === 0}
                      onClick={() => setExemptionFor(e)}
                    >
                      <ShieldAlert className="h-3.5 w-3.5" />
                      <span className="sr-only">Manage exemption for {e.employee_name ?? 'employee'}</span>
                    </Button>
                  </td>
                )}
                {canCalibrate && (
                  <td className="p-2 text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 gap-1 text-xs"
                      onClick={() => setDialogTargets([targetOf(e)])}
                    >
                      <SlidersHorizontal className="h-3.5 w-3.5" />
                      <span className="sr-only">Calibrate {e.employee_name ?? 'employee'}</span>
                    </Button>
                  </td>
                )}
              </tr>
              );
            })}
            {slice.length === 0 && (
              <tr><td colSpan={colCount} className="p-4 text-center text-muted-foreground">No employees match this search.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground">
          <span>Page {current + 1} of {pageCount} · {visible.length} employees</span>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={current === 0} onClick={() => setPage(current - 1)}>Previous</Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" disabled={current >= pageCount - 1} onClick={() => setPage(current + 1)}>Next</Button>
        </div>
      )}

      {dialogTargets && (
        <CalibrateRatingDialog
          open
          onOpenChange={(v) => { if (!v) setDialogTargets(null); }}
          targets={dialogTargets}
          slabs={slabs}
          onDone={() => setSelected([])}
        />
      )}

      <ReviewFormViewerDialog
        instanceId={viewInstanceId}
        slabs={slabs}
        onClose={() => setViewInstanceId(null)}
      />

      {exemptionFor && eligibilityOf?.(exemptionFor) && (
        <ExemptionDialog
          open
          onOpenChange={(v) => { if (!v) setExemptionFor(null); }}
          instanceId={exemptionFor.instance_id}
          cycleId={exemptionFor.cycle_id ?? null}
          employeeId={exemptionFor.employee_id ?? null}
          employeeName={exemptionFor.employee_name ?? 'Employee'}
          result={eligibilityOf(exemptionFor)!}
          canApprove={canApproveExemptions}
        />
      )}
    </div>
  );
}
