import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ArrowDown, ArrowUp, ArrowUpDown, Percent, Search, X, Hash } from 'lucide-react';
import { cn } from '@/lib/utils';
import { BAND_LABELS, BAND_ORDER, type HeatmapRow } from '@/lib/annualReview/bellCurve';

type SortKey = 'name' | 'total' | 1 | 2 | 3 | 4 | 5;
type SortDir = 'asc' | 'desc';
type SortMode = 'count' | 'pct';

function cellClass(compliance: string, count: number): string {
  if (count === 0) return 'bg-muted/40 text-muted-foreground';
  if (compliance === 'green') return 'bg-emerald-500/25 text-emerald-900 dark:text-emerald-100';
  if (compliance === 'amber') return 'bg-amber-500/30 text-amber-900 dark:text-amber-100';
  return 'bg-rose-500/30 text-rose-900 dark:text-rose-100';
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ArrowUpDown className="inline h-3 w-3 opacity-40" aria-hidden />;
  return dir === 'asc'
    ? <ArrowUp className="inline h-3 w-3" aria-hidden />
    : <ArrowDown className="inline h-3 w-3" aria-hidden />;
}

export function RatingHeatmap({
  rows, title, selectedIds = [], onToggle, onClearSelection, onSelectAll,
}: {
  rows: HeatmapRow[];
  title: string;
  selectedIds?: string[];
  onToggle?: (id: string) => void;
  onClearSelection?: () => void;
  onSelectAll?: (ids: string[]) => void;
}) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('total');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [sortMode, setSortMode] = useState<SortMode>('count');

  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q)) : rows.slice();
    const val = (r: HeatmapRow): string | number => {
      if (sortKey === 'name') return r.name.toLowerCase();
      if (sortKey === 'total') return r.total;
      const cell = r.cells.find((c) => c.band === sortKey);
      return sortMode === 'pct' ? (cell?.pct ?? 0) : (cell?.count ?? 0);
    };
    filtered.sort((a, b) => {
      const av = val(a); const bv = val(b);
      const cmp = typeof av === 'string' && typeof bv === 'string' ? av.localeCompare(bv) : Number(av) - Number(bv);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return filtered;
  }, [rows, search, sortKey, sortDir, sortMode]);

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) { setSortDir((d) => (d === 'asc' ? 'desc' : 'asc')); return; }
    setSortKey(key);
    setSortDir(key === 'name' ? 'asc' : 'desc');
  };

  const modeLabel = sortMode === 'count' ? 'Sort by number' : 'Sort by percentage';
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));

  return (
    <Card>
      <CardHeader className="pb-2 space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Heat Map</CardTitle>
            <CardDescription>{title} vs rating distribution — colour shows deviation from target</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={`Filter ${title.toLowerCase()}…`}
                aria-label={`Filter ${title}`}
                className="h-9 w-[200px] pl-7 text-sm"
              />
            </div>
            {selected.size > 0 && (
              <Button variant="ghost" size="sm" className="gap-1" onClick={() => onClearSelection?.()}>
                <X className="h-3.5 w-3.5" /> Clear ({selected.size})
              </Button>
            )}
          </div>
        </div>
        {selected.size > 0 && (
          <p className="text-xs text-muted-foreground">
            {selected.size} {title.toLowerCase()}{selected.size > 1 ? 's' : ''} selected — charts and exports show this selection only.
          </p>
        )}
      </CardHeader>
      <CardContent className="overflow-x-auto">
        {visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data for the current filters.</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr>
                <th className="p-2 w-8">
                  <Checkbox
                    checked={allVisibleSelected}
                    aria-label={`Select all ${title}`}
                    onCheckedChange={(v) => (v ? onSelectAll?.(visible.map((r) => r.id)) : onClearSelection?.())}
                  />
                </th>
                <th className="p-2 text-left font-medium text-muted-foreground">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('name')}>
                    {title} <SortIcon active={sortKey === 'name'} dir={sortDir} />
                  </button>
                </th>
                {BAND_ORDER.map((b) => (
                  <th key={b} className="p-2 text-center font-medium text-muted-foreground text-xs">
                    <button type="button" className="inline-flex flex-col items-center hover:text-foreground" onClick={() => toggleSort(b as SortKey)}>
                      <span className="inline-flex items-center gap-1">{BAND_LABELS[b]} <SortIcon active={sortKey === b} dir={sortDir} /></span>
                      <span className="opacity-60">({b})</span>
                    </button>
                  </th>
                ))}
                <th className="p-2 text-right font-medium text-muted-foreground">
                  <button type="button" className="inline-flex items-center gap-1 hover:text-foreground" onClick={() => toggleSort('total')}>
                    Rated <SortIcon active={sortKey === 'total'} dir={sortDir} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr
                  key={r.id}
                  className={cn('cursor-pointer', selected.has(r.id) && 'bg-primary/5 ring-2 ring-primary/40')}
                  onClick={() => onToggle?.(r.id)}
                >
                  <td className="p-2" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={selected.has(r.id)}
                      aria-label={`Select ${r.name}`}
                      onCheckedChange={() => onToggle?.(r.id)}
                    />
                  </td>
                  <td className="p-2 font-medium max-w-[220px] truncate" title={r.name}>{r.name}</td>
                  {r.cells.map((c) => (
                    <td key={c.band} className="p-1">
                      <div
                        className={cn('rounded-md py-2 text-center tabular-nums min-h-[44px] flex flex-col justify-center', cellClass(c.compliance, c.count))}
                        title={`${c.count} employees — ${c.pct}% (variance ${c.variancePct}%)`}
                      >
                        <span className="font-semibold">{c.count}</span>
                        <span className="text-[10px] opacity-70">{c.pct}%</span>
                      </div>
                    </td>
                  ))}
                  <td className="p-2 text-right tabular-nums">{r.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-4 border-t pt-3 text-xs text-muted-foreground">
          <span>Legend:</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-500/25" /> Within threshold</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-500/30" /> Minor deviation</span>
          <span className="flex items-center gap-1"><span className="h-3 w-3 rounded bg-rose-500/30" /> Major deviation</span>
        </div>
      </CardContent>
    </Card>
  );
}