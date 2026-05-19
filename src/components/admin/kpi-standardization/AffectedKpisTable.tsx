import { useEffect, useState, useCallback, useMemo } from 'react';
import { Loader2, Filter, FilterX, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { pageModes, columnHasVariety, isOutlier } from '@/lib/scannerCellHighlight';
import { fetchAllPaged } from '@/lib/fetchAll';
import {
  applyColumnFilters,
  cellToken,
  distinctValues,
  hasActiveFilter,
  BLANK_TOKEN,
  type ColumnFilters,
} from '@/lib/affectedKpisFilters';

/**
 * Paginated drill-in table showing the actual `kpis` rows that match a given
 * (category_id, kra_name, kpi_name) signature, optionally scoped to a period.
 * Used by Build Registry, Review Registry, and Correct May KPIs to show the
 * detailed employee-level impact of a standardization action.
 */
interface Props {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod?: string;
  reviewYear?: number;
}

const PAGE_SIZE = 25;
const HARD_CAP = 5000;
const SCALE_KEYS = ['frequency', 'r0', 'r1', 'r2', 'r3', 'r4', 'r5'] as const;
const SHOW_SCALE_LS_KEY = 'affectedKpisTable.showScale';

type FilterKey =
  | 'employee'
  | 'period'
  | 'status'
  | 'frequency'
  | 'r0'
  | 'r1'
  | 'r2'
  | 'r3'
  | 'r4'
  | 'r5'
  | 'criteria_uom';

function fmt(v: string | null | undefined): string {
  if (v == null) return '—';
  const s = String(v).trim();
  return s.length === 0 ? '—' : s;
}

interface ColumnFilterPopoverProps {
  label: string;
  values: Array<{ token: string; display: string }>;
  selected: Set<string> | undefined;
  onChange: (next: Set<string> | undefined) => void;
}

function ColumnFilterPopover({ label, values, selected, onChange }: ColumnFilterPopoverProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const active = !!selected && selected.size > 0;

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return values;
    return values.filter(v => v.display.toLowerCase().includes(q));
  }, [values, search]);

  // Draft = the set of currently checked tokens. When the popover opens we
  // seed it with the existing filter, or with ALL values if no filter is set.
  const allTokens = useMemo(() => new Set(values.map(v => v.token)), [values]);
  const [draft, setDraft] = useState<Set<string>>(() => new Set(selected ?? allTokens));
  useEffect(() => {
    if (open) setDraft(new Set(selected ?? allTokens));
  }, [open, selected, allTokens]);

  const toggle = (token: string) => {
    setDraft(prev => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  };

  const handleApply = () => {
    if (draft.size === 0 || draft.size === allTokens.size) {
      // Nothing checked → filter everything out is not useful; treat as no-op.
      // All checked → no filter.
      onChange(draft.size === allTokens.size ? undefined : new Set(draft));
    } else {
      onChange(new Set(draft));
    }
    setOpen(false);
  };

  const handleClearFilter = () => {
    onChange(undefined);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'inline-flex items-center justify-center h-5 w-5 rounded hover:bg-muted ml-1 align-middle',
            active && 'text-primary',
          )}
          aria-label={`Filter ${label}`}
        >
          {active ? <FilterX className="h-3 w-3" /> : <Filter className="h-3 w-3" />}
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-2">
        <div className="text-xs font-medium mb-2">Filter: {label}</div>
        <Input
          placeholder="Search…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="h-7 text-xs mb-2"
        />
        <div className="flex items-center justify-between text-[11px] mb-1">
          <button type="button" className="text-primary hover:underline" onClick={() => setDraft(new Set(allTokens))}>
            Select all
          </button>
          <button type="button" className="text-muted-foreground hover:underline" onClick={() => setDraft(new Set())}>
            Clear
          </button>
        </div>
        <div className="max-h-56 overflow-auto border rounded">
          {filtered.length === 0 && (
            <div className="text-[11px] text-muted-foreground px-2 py-2">No values</div>
          )}
          {filtered.map(v => (
            <label
              key={v.token}
              className="flex items-center gap-2 px-2 py-1 text-xs hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={draft.has(v.token)}
                onCheckedChange={() => toggle(v.token)}
              />
              <span className="truncate" title={v.display}>{v.display}</span>
            </label>
          ))}
        </div>
        <div className="flex items-center justify-end gap-2 mt-2">
          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={handleClearFilter} disabled={!active}>
            Clear filter
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={handleApply}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function periodLabel(r: any): string {
  if (!r.review_period && !r.review_year) return '';
  return `${r.review_period ?? ''} ${r.review_year ?? ''}`.trim();
}
function criteriaUomLabel(r: any): string {
  const c = (r.criteria ?? '').toString().trim();
  const u = (r.uom ?? '').toString().trim();
  return [c, u].filter(Boolean).join(' · ');
}

export function AffectedKpisTable({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }: Props) {
  const [allRows, setAllRows] = useState<any[]>([]);
  const [employees, setEmployees] = useState<Record<string, { name: string }>>({});
  const [page, setPage] = useState(0);
  const [loading, setLoading] = useState(true);
  const [capped, setCapped] = useState(false);
  const [filters, setFilters] = useState<ColumnFilters<FilterKey>>({});
  const [showScale, setShowScale] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    const v = window.localStorage.getItem(SHOW_SCALE_LS_KEY);
    return v === null ? true : v === '1';
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(SHOW_SCALE_LS_KEY, showScale ? '1' : '0');
  }, [showScale]);

  // Reset paging + filters when the signature changes.
  useEffect(() => {
    setPage(0);
    setFilters({});
  }, [categoryId, kraName, kpiName, reviewPeriod, reviewYear]);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    setCapped(false);
    try {
      const data = await fetchAllPaged<any>((from, to) => {
        let q = supabase
          .from('kpis' as any)
          .select(
            'id, employee_id, review_period, review_year, weightage, status, frequency, criteria, uom, r0, r1, r2, r3, r4, r5',
          )
          .eq('category_id', categoryId)
          .eq('kra_name', kraName)
          .eq('kpi_name', kpiName);
        if (reviewPeriod) q = q.eq('review_period', reviewPeriod);
        if (reviewYear) q = q.eq('review_year', reviewYear);
        return q.order('review_year', { ascending: false }).range(from, to) as any;
      });
      const capRows = data.length > HARD_CAP ? data.slice(0, HARD_CAP) : data;
      setCapped(data.length > HARD_CAP);
      setAllRows(capRows);

      const empIds = Array.from(new Set(capRows.map((r: any) => r.employee_id)));
      if (empIds.length > 0) {
        const { data: profs } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', empIds);
        const map: Record<string, { name: string }> = {};
        (profs || []).forEach((p: any) => { map[p.id] = { name: p.full_name }; });
        setEmployees(map);
      } else {
        setEmployees({});
      }
    } catch (e) {
      console.error('AffectedKpisTable fetch failed', e);
    } finally {
      setLoading(false);
    }
  }, [categoryId, kraName, kpiName, reviewPeriod, reviewYear]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Build derived columns (employee, period, criteria/uom) on every row.
  const enriched = useMemo(
    () => allRows.map(r => ({
      ...r,
      employee: employees[r.employee_id]?.name ?? r.employee_id?.slice(0, 8) ?? '',
      period: periodLabel(r),
      criteria_uom: criteriaUomLabel(r),
    })),
    [allRows, employees],
  );

  const filtered = useMemo(() => applyColumnFilters(enriched, filters as ColumnFilters), [enriched, filters]);
  const total = enriched.length;
  const filteredCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(filteredCount / PAGE_SIZE));
  const safePage = Math.min(page, totalPages - 1);
  const pageRows = useMemo(
    () => filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => { setPage(0); }, [filters]);

  // Distinct values for each filterable column, computed over the full set.
  const distinct = useMemo(() => ({
    employee: distinctValues(enriched, 'employee'),
    period: distinctValues(enriched, 'period'),
    status: distinctValues(enriched, 'status'),
    frequency: distinctValues(enriched, 'frequency'),
    r0: distinctValues(enriched, 'r0'),
    r1: distinctValues(enriched, 'r1'),
    r2: distinctValues(enriched, 'r2'),
    r3: distinctValues(enriched, 'r3'),
    r4: distinctValues(enriched, 'r4'),
    r5: distinctValues(enriched, 'r5'),
    criteria_uom: distinctValues(enriched, 'criteria_uom'),
  }), [enriched]);

  const activeFilterCount = hasActiveFilter(filters as ColumnFilters);

  const setColFilter = (key: FilterKey) => (next: Set<string> | undefined) => {
    setFilters(prev => {
      const out = { ...prev };
      if (!next || next.size === 0) delete out[key];
      else out[key] = next;
      return out;
    });
  };

  // Per-page mode + variety for outlier highlighting (current visible page of filtered set).
  const modes = useMemo(() => pageModes(pageRows, SCALE_KEYS), [pageRows]);
  const variety = useMemo(() => {
    const out = {} as Record<(typeof SCALE_KEYS)[number], boolean>;
    for (const k of SCALE_KEYS) {
      out[k] = columnHasVariety(pageRows.map(r => r[k]));
    }
    return out;
  }, [pageRows]);

  if (loading && allRows.length === 0) {
    return <div className="flex items-center gap-2 text-xs text-muted-foreground py-3"><Loader2 className="h-3 w-3 animate-spin" /> Loading…</div>;
  }
  if (total === 0) {
    return <div className="text-xs text-muted-foreground py-2">No KPI rows match this signature.</div>;
  }

  return (
    <div className="space-y-2">
      {capped && (
        <div className="text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded px-2 py-1">
          Showing first {HARD_CAP.toLocaleString()} rows. Scope by period/year to refine.
        </div>
      )}
      <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <span>
            Showing {filteredCount === 0 ? 0 : safePage * PAGE_SIZE + 1}–{Math.min((safePage + 1) * PAGE_SIZE, filteredCount)} of {filteredCount}
            {activeFilterCount > 0 && total !== filteredCount && (
              <span className="text-muted-foreground"> (filtered from {total})</span>
            )}
          </span>
          {activeFilterCount > 0 && (
            <Badge variant="outline" className="text-[10px] gap-1">
              Filters: {activeFilterCount}
              <button
                type="button"
                aria-label="Clear all filters"
                className="hover:text-destructive ml-0.5"
                onClick={() => setFilters({})}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Switch
            id="affected-show-scale"
            checked={showScale}
            onCheckedChange={setShowScale}
            className="scale-75"
          />
          <Label htmlFor="affected-show-scale" className="text-xs cursor-pointer">
            Show scale (Freq · R0–R5)
          </Label>
        </div>
      </div>
      <div className="border rounded-md max-h-72 overflow-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 sticky top-0">
            <tr>
              <th className="text-left px-2 py-1.5 sticky left-0 bg-muted/80 z-10 whitespace-nowrap">
                Employee
                <ColumnFilterPopover label="Employee" values={distinct.employee} selected={filters.employee} onChange={setColFilter('employee')} />
              </th>
              <th className="text-left px-2 py-1.5 whitespace-nowrap">
                Period
                <ColumnFilterPopover label="Period" values={distinct.period} selected={filters.period} onChange={setColFilter('period')} />
              </th>
              <th className="text-left px-2 py-1.5">Wt</th>
              <th className="text-left px-2 py-1.5 whitespace-nowrap">
                Status
                <ColumnFilterPopover label="Status" values={distinct.status} selected={filters.status} onChange={setColFilter('status')} />
              </th>
              {showScale && (
                <>
                  <th className="text-left px-2 py-1.5 whitespace-nowrap">
                    Freq
                    <ColumnFilterPopover label="Freq" values={distinct.frequency} selected={filters.frequency} onChange={setColFilter('frequency')} />
                  </th>
                  {(['r0','r1','r2','r3','r4','r5'] as const).map(k => (
                    <th key={k} className="text-left px-2 py-1.5 whitespace-nowrap">
                      {k.toUpperCase()}
                      <ColumnFilterPopover label={k.toUpperCase()} values={distinct[k]} selected={filters[k]} onChange={setColFilter(k)} />
                    </th>
                  ))}
                  <th className="text-left px-2 py-1.5 whitespace-nowrap">
                    Criteria / UoM
                    <ColumnFilterPopover label="Criteria / UoM" values={distinct.criteria_uom} selected={filters.criteria_uom} onChange={setColFilter('criteria_uom')} />
                  </th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {pageRows.length === 0 && (
              <tr>
                <td colSpan={showScale ? 12 : 4} className="px-2 py-3 text-center text-muted-foreground text-xs">
                  No rows match the current filters.
                </td>
              </tr>
            )}
            {pageRows.map(r => {
              return (
                <tr key={r.id} className="border-t">
                  <td className="px-2 py-1.5 sticky left-0 bg-background z-10 whitespace-nowrap">{r.employee}</td>
                  <td className="px-2 py-1.5 whitespace-nowrap">{r.period}</td>
                  <td className="px-2 py-1.5">{r.weightage ?? '—'}</td>
                  <td className="px-2 py-1.5"><Badge variant="outline" className="text-[10px]">{r.status || '—'}</Badge></td>
                  {showScale && (
                    <>
                      {SCALE_KEYS.map(k => {
                        const outlier = isOutlier(r[k], modes[k], variety[k]);
                        return (
                          <td
                            key={k}
                            className={cn(
                              'px-2 py-1.5 tabular-nums whitespace-nowrap text-[11px]',
                              outlier && 'bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium',
                              fmt(r[k]) === '—' && 'text-muted-foreground',
                            )}
                            title={outlier ? `Differs from page mode (${modes[k]})` : undefined}
                          >
                            {fmt(r[k])}
                          </td>
                        );
                      })}
                      <td className="px-2 py-1.5 text-[11px] whitespace-nowrap text-muted-foreground">
                        {r.criteria_uom || '—'}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2">
          <Button size="sm" variant="outline" disabled={safePage === 0 || loading} onClick={() => setPage(p => Math.max(0, p - 1))}>Prev</Button>
          <span className="text-xs text-muted-foreground">{safePage + 1} / {totalPages}</span>
          <Button size="sm" variant="outline" disabled={safePage >= totalPages - 1 || loading} onClick={() => setPage(p => p + 1)}>Next</Button>
        </div>
      )}
    </div>
  );
}