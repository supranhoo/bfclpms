import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useActiveCycle,
  useReviewerInstancesPaginated,
  useReviewerRoleCounts,
} from '@/hooks/useAnnualReview';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronRight, Scale, Search, Users, UserPlus, ChevronLeft, AlertTriangle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { AnnualReviewerRole, AnnualReviewStatus } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import type { ReviewerScope } from '@/services/annualReview/annualReviewService';
import { stageForReviewer } from '@/lib/annualReview/stageForReviewer';
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmployeeDirectoryDialog } from '@/components/annual-review/EmployeeDirectoryDialog';
import { supabase } from '@/integrations/supabase/client';
import { useDirectoryAccess } from '@/hooks/useDirectoryAccess';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

const QUEUE_PAGE_SIZE_KEY = 'annual-review:team:pageSize';
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

const STATUS_FILTERS: { value: AnnualReviewStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_self', label: 'Self' },
  { value: 'pending_manager', label: 'Manager' },
  { value: 'pending_skip', label: 'Skip' },
  { value: 'pending_dept', label: 'Dept Head' },
  { value: 'pending_bu', label: 'BU' },
  { value: 'pending_hr', label: 'HR' },
  { value: 'completed', label: 'Done' },
];

const SCOPE_FILTERS: { value: ReviewerScope; label: string }[] = [
  { value: 'any', label: 'Any' },
  { value: 'manager', label: 'Direct reports' },
  { value: 'skip', label: 'Skip-level' },
  { value: 'dept', label: 'Dept Head' },
  { value: 'bu', label: 'BU Head' },
  { value: 'hr', label: 'HR' },
];

const SCOPE_BADGE_LABEL: Record<Exclude<ReviewerScope, 'any'>, string> = {
  manager: 'Manager',
  skip: 'Skip',
  dept: 'Dept Head',
  bu: 'BU Head',
  hr: 'HR',
};

/**
 * Priority order when the current user matches multiple reviewer columns on
 * one instance (e.g. HR head of his own direct report). "Closest relationship
 * first" — mirrors the reviewer-chain sequence.
 */
function resolveMyRole(
  row: InstanceWithEmployee,
  uid: string | undefined,
): Exclude<ReviewerScope, 'any'> | null {
  if (!uid) return null;
  // Defense-in-depth: ignore a reviewer-id column whose stage isn't part of
  // this instance's enabled_stages. Historical rows kept stale reviewer ids
  // (e.g. manager_id) after HR narrowed the workflow, causing ghost "Direct
  // reports" chips. Server backfill nulls these, but this guard protects
  // rows fetched before the backfill lands and any future drift.
  const stages: readonly AnnualReviewerRole[] = Array.isArray(row.enabled_stages)
    ? (row.enabled_stages as AnnualReviewerRole[])
    : [];
  const has = (s: AnnualReviewerRole) => stages.length === 0 || stages.includes(s);
  if (row.manager_id === uid && has('manager')) return 'manager';
  if (row.skip_id === uid && has('skip_manager')) return 'skip';
  if (row.dept_head_id === uid && has('dept_head')) return 'dept';
  if (row.bu_head_id === uid && has('bu_head')) return 'bu';
  if (row.hr_id === uid && has('hr')) return 'hr';
  return null;
}

// Reviewer resolution — see `@/lib/annualReview/stageForReviewer`.

export default function TeamAnnualReview() {
  const { user } = useAuth();
  const { data: cycle } = useActiveCycle();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [urlParams, setUrlParams] = useSearchParams();

  // ----- URL-synced queue state (restored on Back from the detail page) -----
  const urlSearch  = urlParams.get('q') ?? '';
  const urlStatus  = (urlParams.get('status') as AnnualReviewStatus | 'all' | null) ?? 'all';
  const urlPage    = Math.max(1, Number(urlParams.get('page') ?? '1') || 1);
  const urlScope   = (urlParams.get('scope') as ReviewerScope | null) ?? 'any';

  const [search, setSearch] = useState(urlSearch);
  const [debouncedSearch, setDebouncedSearch] = useState(urlSearch);
  const [statusFilter, setStatusFilter] = useState<AnnualReviewStatus | 'all'>(urlStatus);
  const [scopeFilter, setScopeFilter] = useState<ReviewerScope>(urlScope);
  const [page, setPage] = useState(urlPage);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
    const raw = Number(window.localStorage.getItem(QUEUE_PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(raw as typeof PAGE_SIZE_OPTIONS[number]) ? raw : DEFAULT_PAGE_SIZE;
  });
  const [directoryOpen, setDirectoryOpen] = useState(false);

  // Access resolved server-side (Admin / HR PMS / HR-team / BU-head / HOD).
  // See POLICY §AR-DIRECTORY-ACCESS-MATRIX.
  const directoryAccess = useDirectoryAccess();
  const canSearchDirectory = directoryAccess.canAccess;

  const { data: directoryFlag } = useQuery({
    queryKey: ['app-settings', 'annual_review_directory_search_enabled'],
    enabled: canSearchDirectory,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('annual_review_directory_search_enabled')
        .maybeSingle();
      if (error) return false;
      return Boolean(data?.annual_review_directory_search_enabled);
    },
    staleTime: 60_000,
  });
  const directoryEnabled = canSearchDirectory && directoryFlag === true;

  // Debounce search → 300ms, reset to page 1 on change.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, scopeFilter, pageSize]);

  // Mirror queue state into the URL so the detail page's Back button restores
  // the exact filters/page (and a browser refresh stays put).
  useEffect(() => {
    const next = new URLSearchParams();
    if (debouncedSearch) next.set('q', debouncedSearch);
    if (statusFilter !== 'all') next.set('status', statusFilter);
    if (scopeFilter !== 'any') next.set('scope', scopeFilter);
    if (page !== 1) next.set('page', String(page));
    setUrlParams(next, { replace: true });
  }, [debouncedSearch, statusFilter, scopeFilter, page, setUrlParams]);

  const { data: paged, isLoading, isFetching, isError, error, refetch } = useReviewerInstancesPaginated(
    user?.id,
    cycle?.id,
    { page, pageSize, search: debouncedSearch || undefined, status: statusFilter, scope: scopeFilter },
  );
  const rows = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Per-role counts — drives which "My role" chips render.
  const { data: roleCounts } = useReviewerRoleCounts(user?.id, cycle?.id);
  const visibleScopeFilters = SCOPE_FILTERS.filter((s) => {
    if (s.value === 'any') return true;
    // Always show the currently selected chip so the user can un-select it
    // even if counts haven't loaded yet.
    if (s.value === scopeFilter) return true;
    return (roleCounts?.[s.value] ?? 0) > 0;
  });
  const showScopeRow = visibleScopeFilters.length > 2; // Any + at least one role

  const setStoredPageSize = (n: number) => {
    setPageSize(n);
    try { window.localStorage.setItem(QUEUE_PAGE_SIZE_KEY, String(n)); } catch { /* ignore */ }
  };

  // Build the canonical "back to queue" URL that the detail page will restore.
  const returnTo = useMemo(() => {
    const qs = new URLSearchParams();
    if (debouncedSearch) qs.set('q', debouncedSearch);
    if (statusFilter !== 'all') qs.set('status', statusFilter);
    if (scopeFilter !== 'any') qs.set('scope', scopeFilter);
    if (page !== 1) qs.set('page', String(page));
    const s = qs.toString();
    return s ? `/annual-review/team?${s}` : '/annual-review/team';
  }, [debouncedSearch, statusFilter, scopeFilter, page]);

  const goToDetail = (instanceId: string) => {
    navigate(`/annual-review/team/${instanceId}`, {
      state: { siblings: rows.map((r) => r.id), returnTo },
    });
  };

  const handleDirectoryPick = (instanceId: string, _opts: { autoOpenAssisted: boolean }) => {
    // Proxy verification (selfie + declaration) is now triggered at submit time,
    // not on entry. We ignore `autoOpenAssisted` here so the proxy can fill the
    // form first and only attest at final submission.
    void queryClient.invalidateQueries({ queryKey: ['annual-review'] });
    void queryClient.invalidateQueries({ queryKey: ['annualReview'] });
    goToDetail(instanceId);
  };

  if (!cycle) return <div className="p-6">No active annual review cycle.</div>;
  if (isLoading && !paged) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(page * pageSize, total);

  return (
    <div className="p-4 md:p-6 max-w-[1600px] mx-auto">
      <header className="flex flex-col sm:flex-row sm:items-start justify-between mb-3 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Annual Review</h1>
          <div className="flex items-center gap-2 mt-1">
            <p className="text-sm text-muted-foreground">{cycle.name}</p>
            <Badge variant="secondary" className="text-[10px]">{total} in queue</Badge>
            {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="gap-1.5">
            <Link to="/annual-review/calibrate"><Scale className="h-4 w-4" /> Calibration worksheet</Link>
          </Button>
        </div>
      </header>

      <div className="space-y-3 min-w-0">

          {/* "My role" scope filter — hidden for single-role users */}
          {showScopeRow && (
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] text-muted-foreground mr-1">My role:</span>
              {visibleScopeFilters.map((s) => {
                const count = s.value === 'any' ? undefined : roleCounts?.[s.value];
                return (
                  <button
                    key={s.value}
                    type="button"
                    onClick={() => setScopeFilter(s.value)}
                    className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                      scopeFilter === s.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background hover:bg-muted border-border text-muted-foreground'
                    }`}
                    title={s.value === 'manager' ? 'Employees who report directly to you' : undefined}
                  >
                    {s.label}
                    {typeof count === 'number' && count > 0 && (
                      <span className="ml-1 opacity-70 tabular-nums">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Search + filters */}
          <div className="flex flex-col md:flex-row md:items-center gap-2">
            <div className="relative flex-1 min-w-0">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                placeholder={directoryEnabled
                  ? 'Search your queue by name or code…'
                  : 'Search by name or code…'}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 text-sm"
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {STATUS_FILTERS.map((s) => (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setStatusFilter(s.value)}
                  className={`text-[11px] px-2.5 py-1 rounded-full border transition-colors ${
                    statusFilter === s.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background hover:bg-muted border-border text-muted-foreground'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            {directoryEnabled && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDirectoryOpen(true)}
                className="h-9 gap-1.5 shrink-0"
                title={directoryAccess.scope === 'bu'
                  ? 'Search employees in your business unit and start a review to assist with form filling.'
                  : 'Search the full employee directory and start a review for anyone — even outside your team.'}
              >
                <UserPlus className="h-4 w-4" />
                {directoryAccess.scope === 'bu' ? 'BU employees' : 'All employees'}
              </Button>
            )}
          </div>

          {isError && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Team queue could not be loaded</AlertTitle>
              <AlertDescription className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <span>{error instanceof Error ? error.message : 'Please retry. Your reviewer assignments have not been changed.'}</span>
                <Button type="button" size="sm" variant="outline" onClick={() => void refetch()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Grid of employees */}
          <ul className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-2.5">
            {rows.map((i) => {
              const stage = stageForReviewer(i, user?.id);
              const myRole = resolveMyRole(i, user?.id);
              const initials = (i.employee?.full_name ?? '?')
                .trim().split(/\s+/).slice(0, 2)
                .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
              return (
                <li key={i.id}>
                  <button
                    type="button"
                    onClick={() => goToDetail(i.id)}
                    className="group w-full h-full text-left rounded-lg border bg-card p-3 transition-all hover:bg-muted/40 hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 flex flex-col gap-2 min-h-[96px]"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-9 w-9 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                        {initials}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm leading-tight truncate">
                          {i.employee?.full_name ?? 'Employee unavailable'}
                        </p>
                        {i.employee && (
                          <p className="text-[11px] text-muted-foreground truncate mt-0.5">
                            {i.employee.employee_code ?? '—'} · {i.employee.designation ?? '—'}
                          </p>
                        )}
                      </div>
                      <ChevronRight className="h-4 w-4 text-muted-foreground/60 group-hover:text-primary shrink-0" />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5 mt-auto">
                      <AnnualReviewStatusBadge status={i.overall_status} />
                      {myRole && (
                        <span
                          className="inline-flex items-center rounded-md border border-primary/20 bg-primary/5 px-1.5 py-0.5 text-[10px] font-medium text-primary"
                          title={`Your relationship to this employee: ${SCOPE_BADGE_LABEL[myRole]}`}
                        >
                          You: {SCOPE_BADGE_LABEL[myRole]}
                        </span>
                      )}
                      {stage && (
                        <span className="text-[10px] font-medium text-amber-600 dark:text-amber-400">
                          Awaiting you
                        </span>
                      )}
                      {i.submitted_via_proxy && (
                        <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                          <UserPlus className="h-3 w-3" /> Assisted
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              );
            })}
            {!isError && rows.length === 0 && (
              <li className="col-span-full rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
                <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>
                  {debouncedSearch || statusFilter !== 'all'
                    ? 'No matches in your queue.'
                    : 'No employees in your queue.'}
                </p>
                {directoryEnabled && (
                  <Button variant="link" className="mt-1 h-auto p-0" onClick={() => setDirectoryOpen(true)}>
                    {debouncedSearch
                      ? `Search all employees for “${debouncedSearch}”`
                      : 'Search all employees'}
                  </Button>
                )}
              </li>
            )}
          </ul>

          {total > 0 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-3 border-t">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span>Per page</span>
                  <Select value={String(pageSize)} onValueChange={(v) => setStoredPageSize(Number(v))}>
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
                <span className="text-[11px] tabular-nums px-1">
                  Page {page} / {totalPages}
                </span>
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

      <EmployeeDirectoryDialog
        open={directoryOpen}
        onOpenChange={setDirectoryOpen}
        cycleId={cycle.id}
        cycleName={cycle.name}
        onSelectInstance={handleDirectoryPick}
      />
    </div>
  );
}
