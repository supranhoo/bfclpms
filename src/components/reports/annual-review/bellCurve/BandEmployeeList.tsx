import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Download, Search, X } from 'lucide-react';
import {
  DEFAULT_RATING_SLABS, formatRating5, formatSlabPercent, resolveSlabPercent, type RatingSlab,
} from '@/lib/annualReview/ratingSlab';
import type { BandEmployee } from '@/lib/annualReview/bellCurve';

const PAGE_SIZE = 25;

function csvCell(v: string | number | null): string {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/**
 * ADR-218c — employees behind a single heat map cell. Pure presentation over
 * rows already loaded by the tab; no network calls.
 */
export function BandEmployeeList({
  employees, groupName, bandLabel, bandSub, slabs = DEFAULT_RATING_SLABS, onClose,
}: {
  employees: BandEmployee[];
  groupName: string;
  bandLabel: string;
  bandSub: string;
  slabs?: ReadonlyArray<RatingSlab>;
  onClose: () => void;
}) {
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

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

  const exportCsv = () => {
    const header = ['Employee Code', 'Name', 'Department', 'Grade', 'Manager', 'Final Score', 'Final Rating (/5)', 'Slab %'];
    const lines = [header.join(',')];
    for (const e of visible) {
      const pct = resolveSlabPercent(e.rating, slabs);
      lines.push([
        e.employee_code, e.employee_name, e.department_name ?? '', e.grade ?? '', e.manager_name ?? '',
        e.total_score === null ? '' : Number(e.total_score).toFixed(2),
        e.rating.toFixed(2),
        pct === null ? '' : `${pct}%`,
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

  return (
    <div className="rounded-md border bg-muted/20 p-3 space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm font-medium">
          {groupName} · {bandLabel}
          <span className="text-muted-foreground font-normal"> ({bandSub}) — {employees.length} employee{employees.length === 1 ? '' : 's'}</span>
        </p>
        <div className="flex items-center gap-2">
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
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="p-2 text-left font-medium">Code</th>
              <th className="p-2 text-left font-medium">Name</th>
              <th className="p-2 text-left font-medium">Department</th>
              <th className="p-2 text-left font-medium">Grade</th>
              <th className="p-2 text-left font-medium">Manager</th>
              <th className="p-2 text-right font-medium">Final Score</th>
              <th className="p-2 text-right font-medium">Rating /5</th>
              <th className="p-2 text-right font-medium">Slab %</th>
            </tr>
          </thead>
          <tbody>
            {slice.map((e) => (
              <tr key={e.instance_id} className="border-b last:border-0">
                <td className="p-2 tabular-nums">{e.employee_code ?? '—'}</td>
                <td className="p-2 font-medium">{e.employee_name ?? '—'}</td>
                <td className="p-2 text-muted-foreground">{e.department_name ?? '—'}</td>
                <td className="p-2 text-muted-foreground">{e.grade ?? '—'}</td>
                <td className="p-2 text-muted-foreground">{e.manager_name ?? '—'}</td>
                <td className="p-2 text-right tabular-nums">{e.total_score === null ? '—' : Number(e.total_score).toFixed(2)}</td>
                <td className="p-2 text-right tabular-nums">{formatRating5(e.rating)}</td>
                <td className="p-2 text-right tabular-nums">{formatSlabPercent(resolveSlabPercent(e.rating, slabs))}</td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr><td colSpan={8} className="p-4 text-center text-muted-foreground">No employees match this search.</td></tr>
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
    </div>
  );
}