import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Loader2, ChevronRight, ChevronLeft, Search, Users, AlertTriangle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useHierarchyCompletedReviews } from '@/hooks/annualReview/useHierarchyCompleted';
import type { HierarchyCompletedRow } from '@/services/annualReview/hierarchyCompleted';

const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;

const REL_LABEL: Record<HierarchyCompletedRow['viewer_relationship'], string> = {
  admin: 'Admin', hr: 'HR', management: 'Management', bu_head: 'BU Head',
  dept_head: 'Dept Head', skip: 'Skip', manager: 'Manager', upline: 'Upline',
};

/**
 * ADR-162 — Read-only listing of completed annual reviews for anyone in the
 * caller's reporting downline (or full org for Admin / HR PMS). Restricted
 * to employees with platform login access.
 */
export function HierarchyCompletedList({ cycleId }: { cycleId: string }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(20);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, pageSize]);

  const { data, isLoading, isFetching, isError, error, refetch } = useHierarchyCompletedReviews({
    cycleId, search: debouncedSearch || undefined, page, pageSize,
  });
  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(page * pageSize, total);

  const returnTo = useMemo(() => {
    const qs = new URLSearchParams({ tab: 'hierarchy' });
    if (debouncedSearch) qs.set('q', debouncedSearch);
    if (page !== 1) qs.set('page', String(page));
    return `/annual-review/team?${qs.toString()}`;
  }, [debouncedSearch, page]);

  const goToDetail = (id: string) =>
    navigate(`/annual-review/team/${id}`, {
      state: { siblings: rows.map((r) => r.id), returnTo },
    });

  if (isLoading && !data) {
    return (
      <div className="p-6 flex items-center gap-2 text-sm">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading completed reviews…
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant="secondary" className="text-[10px]">{total} completed</Badge>
        {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        <p className="text-[11px] text-muted-foreground">
          Read-only. Employees with platform access only.
        </p>
      </div>

      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search by name or code…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-8 h-9 text-sm"
        />
      </div>

      {isError && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Could not load hierarchy reviews</AlertTitle>
          <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <span>{error instanceof Error ? error.message : 'Please retry.'}</span>
            <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>Retry</Button>
          </AlertDescription>
        </Alert>
      )}

      <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
        {rows.map((r) => {
          const initials = (r.employee_name ?? '?')
            .trim().split(/\s+/).slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
          const rating = r.total_score != null ? (Number(r.total_score) / 20).toFixed(2) : null;
          return (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => goToDetail(r.id)}
                className="group w-full h-full text-left rounded-lg border bg-card p-3 transition-all hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex flex-col gap-2 min-h-[96px]"
              >
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm leading-tight truncate">
                      {r.employee_name ?? 'Employee unavailable'}
                    </p>
                    <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                      {r.employee_code ?? '—'} · {r.designation ?? '—'}
                    </p>
                    {(r.department_name || r.business_unit_name) && (
                      <p className="text-[10px] text-muted-foreground/80 truncate">
                        {[r.department_name, r.business_unit_name].filter(Boolean).join(' · ')}
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary shrink-0" />
                </div>
                <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                  <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                    Completed
                  </span>
                  {rating && (
                    <span className="text-[10px] font-medium text-muted-foreground tabular-nums">
                      {rating} / 5
                    </span>
                  )}
                  <span
                    className="inline-flex items-center rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                    title={`Your relationship: ${REL_LABEL[r.viewer_relationship]}`}
                  >
                    You: {REL_LABEL[r.viewer_relationship]}
                  </span>
                </div>
              </button>
            </li>
          );
        })}
        {!isError && rows.length === 0 && (
          <li className="col-span-full rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>
              {debouncedSearch
                ? 'No completed reviews match your search in your hierarchy.'
                : 'No completed reviews are visible to you yet in this cycle.'}
            </p>
          </li>
        )}
      </ul>

      {total > 0 && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <span>Per page</span>
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-7 w-[64px] text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((n) => (
                    <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-[11px] text-muted-foreground tabular-nums">
              {fromN}–{toN} of {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              disabled={page <= 1 || isFetching}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              aria-label="Previous page"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Button>
            <span className="text-[11px] tabular-nums px-1">Page {page} / {totalPages}</span>
            <Button
              variant="outline" size="sm" className="h-7 px-2"
              disabled={page >= totalPages || isFetching}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              aria-label="Next page"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

// Keep Link import used if consumers want to link back.
void Link;