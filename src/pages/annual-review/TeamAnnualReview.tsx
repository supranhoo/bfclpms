import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useActiveCycle,
  useReviewerInstancesPaginated,
  useTemplate,
  useInstanceResponses,
  useAdvanceStatus,
  useDebouncedResponseDraft,
  useUploadEvidence,
  useSendBackStatus,
} from '@/hooks/useAnnualReview';
import { AnnualReviewStageTracker } from '@/components/annual-review/AnnualReviewStageTracker';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { CriteriaScoringMatrix } from '@/components/annual-review/CriteriaScoringMatrix';
import { SystemScoresPanel } from '@/components/annual-review/SystemScoresPanel';
import { fyStartFromCycle } from '@/lib/annualReview/fiscalYear';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronRight, Scale, Search, Users, UserPlus, ChevronLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { AnnualReviewerRole, AnnualReviewStatus, EvidenceItem } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import { enabledChain } from '@/lib/annualReview/stageChain';
import { useProxyEligibility } from '@/hooks/useProxyEligibility';
import { AssistedSubmissionDialog } from '@/components/annual-review/AssistedSubmissionDialog';
import { Badge } from '@/components/ui/badge';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { EmployeeDirectoryDialog } from '@/components/annual-review/EmployeeDirectoryDialog';
import { supabase } from '@/integrations/supabase/client';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LanguageSwitcher } from '@/components/annual-review/LanguageSwitcher';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';

const QUEUE_PAGE_SIZE_KEY = 'annual-review:team:pageSize';
const PAGE_SIZE_OPTIONS = [10, 20, 50] as const;
const DEFAULT_PAGE_SIZE = 20;

const STATUS_FILTERS: { value: AnnualReviewStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'pending_self', label: 'Self' },
  { value: 'pending_manager', label: 'Manager' },
  { value: 'pending_skip', label: 'Skip' },
  { value: 'pending_bu', label: 'BU' },
  { value: 'pending_hr', label: 'HR' },
  { value: 'completed', label: 'Done' },
];

const STAGE_FOR_REVIEWER = (inst: InstanceWithEmployee, uid: string): AnnualReviewerRole | null => {
  if (inst.overall_status === 'pending_manager' && inst.manager_id === uid) return 'manager';
  if (inst.overall_status === 'pending_skip' && inst.skip_id === uid) return 'skip_manager';
  if (inst.overall_status === 'pending_bu' && inst.bu_head_id === uid) return 'bu_head';
  if (inst.overall_status === 'pending_hr' && inst.hr_id === uid) return 'hr';
  return null;
};

export default function TeamAnnualReview() {
  const { user, isAdmin, hasRole } = useAuth();
  const { data: cycle } = useActiveCycle();
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AnnualReviewStatus | 'all'>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(() => {
    if (typeof window === 'undefined') return DEFAULT_PAGE_SIZE;
    const raw = Number(window.localStorage.getItem(QUEUE_PAGE_SIZE_KEY));
    return PAGE_SIZE_OPTIONS.includes(raw as typeof PAGE_SIZE_OPTIONS[number]) ? raw : DEFAULT_PAGE_SIZE;
  });
  // Remember instances we've seen across pages so the right-pane stays mounted
  // when the user pages forward/back or arrives via the directory dialog.
  const [seen, setSeen] = useState<Map<string, InstanceWithEmployee>>(new Map());
  const [drawer, setDrawer] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [autoAssistedForInstance, setAutoAssistedForInstance] = useState<string | null>(null);

  const isMobile = useIsMobile();

  const canSearchDirectory = isAdmin || hasRole('hr_pms');

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
  useEffect(() => { setPage(1); }, [debouncedSearch, statusFilter, pageSize]);

  const { data: paged, isLoading, isFetching } = useReviewerInstancesPaginated(
    user?.id,
    cycle?.id,
    { page, pageSize, search: debouncedSearch || undefined, status: statusFilter },
  );
  const rows = paged?.rows ?? [];
  const total = paged?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // Cache every row we've ever loaded so right-pane survives pagination/search.
  useEffect(() => {
    if (!rows.length) return;
    setSeen((prev) => {
      const next = new Map(prev);
      for (const r of rows) next.set(r.id, r);
      return next;
    });
  }, [rows]);

  // Auto-select first row of the current page when nothing is selected.
  useEffect(() => {
    if (!selectedId && rows.length) setSelectedId(rows[0].id);
  }, [rows, selectedId]);

  const selected = (selectedId && (rows.find((r) => r.id === selectedId) ?? seen.get(selectedId))) ?? null;

  const setStoredPageSize = (n: number) => {
    setPageSize(n);
    try { window.localStorage.setItem(QUEUE_PAGE_SIZE_KEY, String(n)); } catch { /* ignore */ }
  };

  const onPick = (id: string) => {
    setSelectedId(id);
    if (isMobile) setDrawer(true);
  };

  const handleDirectoryPick = (instanceId: string, opts: { autoOpenAssisted: boolean }) => {
    setSelectedId(instanceId);
    if (opts.autoOpenAssisted) setAutoAssistedForInstance(instanceId);
    if (isMobile) setDrawer(true);
    // Make sure the new instance becomes visible everywhere
    void queryClient.invalidateQueries({ queryKey: ['annual-review'] });
    void queryClient.invalidateQueries({ queryKey: ['annualReview'] });
  };

  if (!cycle) return <div className="p-6">No active annual review cycle.</div>;
  if (isLoading && !paged) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const fromN = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const toN = Math.min(page * pageSize, total);

  const list = (
    <div className="space-y-3">
      {/* Directory entry-point (Admin / HR PMS, behind feature flag) */}
      {directoryEnabled && (
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <Button
            type="button"
            onClick={() => setDirectoryOpen(true)}
            className="w-full h-10 gap-2"
          >
            <Search className="h-4 w-4" />
            Find employee
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Search any active employee and start their annual review — even outside your direct team.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            My queue
          </span>
          <Badge variant="secondary" className="text-[10px]">{total}</Badge>
          {isFetching && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
        </div>
        <div className="flex items-center gap-1">
          <span className="text-[10px] text-muted-foreground">Per page</span>
          <Select value={String(pageSize)} onValueChange={(v) => setStoredPageSize(Number(v))}>
            <SelectTrigger className="h-7 w-[64px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PAGE_SIZE_OPTIONS.map((n) => (
                <SelectItem key={n} value={String(n)}>{n}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
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

      <div className="flex flex-wrap gap-1">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => setStatusFilter(s.value)}
            className={`text-[11px] px-2 py-1 rounded-full border transition-colors ${
              statusFilter === s.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background hover:bg-muted border-border text-muted-foreground'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <ul className="space-y-1">
        {rows.map((i) => {
          const stage = user ? STAGE_FOR_REVIEWER(i, user.id) : null;
          const isSelected = selectedId === i.id;
          const initials = (i.employee?.full_name ?? '?')
            .trim().split(/\s+/).slice(0, 2)
            .map((p) => p[0]?.toUpperCase() ?? '').join('') || '?';
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onPick(i.id)}
                className={`w-full text-left rounded-md border p-3 transition-colors min-h-16 hover:bg-muted/50 ${isSelected ? 'bg-primary/5 border-l-2 border-l-primary border-primary/40' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[11px] font-semibold shrink-0">
                    {initials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-sm truncate">{i.employee?.full_name ?? i.employee_id}</p>
                    <p className="text-xs text-muted-foreground truncate">{i.employee?.employee_code} · {i.employee?.designation ?? '—'}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AnnualReviewStatusBadge status={i.overall_status} />
                  {stage && <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400">Awaiting you</span>}
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
        {rows.length === 0 && (
          <li className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
            <p>{debouncedSearch || statusFilter !== 'all' ? 'No matches on this page.' : 'No employees in your queue.'}</p>
            {directoryEnabled && (
              <Button variant="link" className="mt-1 h-auto p-0" onClick={() => setDirectoryOpen(true)}>
                Find an employee
              </Button>
            )}
          </li>
        )}
      </ul>

      {total > 0 && (
        <div className="flex items-center justify-between pt-2 border-t">
          <span className="text-[11px] text-muted-foreground">
            {fromN}–{toN} of {total}
          </span>
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
  );

  return (
    <div className="p-4 md:p-6">
      <header className="flex items-start justify-between mb-4 gap-3">
        <div>
          <h1 className="text-2xl font-bold">Team Annual Review</h1>
          <p className="text-sm text-muted-foreground">{cycle.name}</p>
        </div>
        <Button asChild variant="outline" className="gap-1.5">
          <Link to="/annual-review/calibrate"><Scale className="h-4 w-4" /> Calibration worksheet</Link>
        </Button>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <aside className="md:col-span-1">{list}</aside>
        <section className="md:col-span-2 hidden md:block">
          {selected ? (
            <ReviewDetail
              instance={selected}
              fiscalYear={fyStartFromCycle(cycle)}
              autoOpenAssisted={autoAssistedForInstance === selected.id}
              onAutoAssistedConsumed={() => setAutoAssistedForInstance(null)}
            />
          ) : (
            <Card><CardContent className="p-6 text-muted-foreground">Pick someone to review.</CardContent></Card>
          )}
        </section>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="bottom" className="h-[92dvh] overflow-y-auto">
          {selected && (
            <ReviewDetail
              instance={selected}
              fiscalYear={fyStartFromCycle(cycle)}
              autoOpenAssisted={autoAssistedForInstance === selected.id}
              onAutoAssistedConsumed={() => setAutoAssistedForInstance(null)}
            />
          )}
        </SheetContent>
      </Sheet>

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

function ReviewDetail({
  instance,
  fiscalYear,
  autoOpenAssisted = false,
  onAutoAssistedConsumed,
}: {
  instance: InstanceWithEmployee;
  fiscalYear?: number;
  autoOpenAssisted?: boolean;
  onAutoAssistedConsumed?: () => void;
}) {
  const { user, profile } = useAuth();
  const queryClient = useQueryClient();
  const { data: template } = useTemplate(
    (instance as { template_override_id?: string | null }).template_override_id ?? instance.template_id,
  );
  const { data: responses = [] } = useInstanceResponses(instance.id);
  const advance = useAdvanceStatus();
  const sendBack = useSendBackStatus();
  const upload = useUploadEvidence();
  const stageRole = user ? STAGE_FOR_REVIEWER(instance, user.id) : null;
  // Proxy assistance: enabled only for pending_self when no native role applies.
  const { data: proxyEligible } = useProxyEligibility(
    instance.id,
    !stageRole && instance.overall_status === 'pending_self',
  );
  const proxyMode = !stageRole && instance.overall_status === 'pending_self' && proxyEligible === true;
  const role: AnnualReviewerRole | null = stageRole ?? (proxyMode ? 'self' : null);
  const myResponse = role ? responses.find((r) => r.reviewer_role === role) ?? null : null;
  const locked = !role || myResponse?.is_locked;
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');
  const [assistedOpen, setAssistedOpen] = useState(false);

  // When the directory flow lands on an assisted-mode candidate, open the
  // selfie capture automatically once proxy eligibility resolves true.
  useEffect(() => {
    if (autoOpenAssisted && proxyMode) {
      setAssistedOpen(true);
      onAutoAssistedConsumed?.();
    }
  }, [autoOpenAssisted, proxyMode, onAutoAssistedConsumed]);

  const { draft, setDraft, flush, status } = useDebouncedResponseDraft({
    instanceId: instance.id,
    reviewerId: user?.id ?? '',
    role: role ?? 'manager',
    initial: myResponse,
    enabled: !!role && !locked,
  });

  const comparison = useMemo(() => {
    const labels: Record<AnnualReviewerRole, string> = { self: 'Self', manager: 'Manager', skip_manager: 'Skip', bu_head: 'BU', hr: 'HR' };
    const previous: { label: string; values: Record<string, number | undefined> }[] = [];
    for (const r of responses) {
      if (r.reviewer_role !== role) previous.push({ label: labels[r.reviewer_role], values: r.criteria_scores });
    }
    return previous;
  }, [responses, role]);

  const onUpload = async (criterionId: string, file: File): Promise<EvidenceItem | void> => {
    if (!user || !role) return;
    const ev = await upload.mutateAsync({ instanceId: instance.id, reviewerId: user.id, role, file });
    const tagged: EvidenceItem = { ...ev, name: `${criterionId}::${ev.name}` };
    setDraft((p) => ({ ...p, evidence: [...(p.evidence ?? []), tagged] }));
    return tagged;
  };

  const handleSubmit = async () => {
    if (!role) return;
    if (proxyMode) {
      // Save draft then open verification dialog. Final submission happens inside the dialog.
      try { await flush(); setAssistedOpen(true); }
      catch (e) { toast.error((e as Error).message); }
      return;
    }
    try { await flush(); await advance.mutateAsync({ instanceId: instance.id, role }); toast.success('Submitted.'); }
    catch (e) { toast.error((e as Error).message); }
  };

  const handleSendBack = async () => {
    if (!role || role === 'self') return;
    try {
      await sendBack.mutateAsync({ instanceId: instance.id, role, reason: sendBackReason.trim() || null });
      toast.success('Returned to previous stage.');
      setSendBackOpen(false);
      setSendBackReason('');
    } catch (e) { toast.error((e as Error).message); }
  };

  // Hide Send Back when current role is the first enabled stage — no prior stage exists.
  const chain = enabledChain(instance.enabled_stages);
  const canSendBack = !!role && role !== 'self' && chain.indexOf(role) > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{instance.employee?.full_name ?? instance.employee_id}</CardTitle>
              <p className="text-sm text-muted-foreground">{instance.employee?.employee_code} · {instance.employee?.designation ?? '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <AnnualReviewStatusBadge status={instance.overall_status} />
              {instance.submitted_via_proxy && (
                <Badge variant="secondary" className="text-xs">Submitted with assistance</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent><AnnualReviewStageTracker status={instance.overall_status} enabledStages={instance.enabled_stages} /></CardContent>
      </Card>

      {proxyMode && (
        <Card className="border-amber-500/40 bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4 text-sm">
            <p className="font-medium">Assisted self-review mode</p>
            <p className="text-muted-foreground mt-1">
              You are filling the self-stage on behalf of <strong>{instance.employee?.full_name ?? 'this employee'}</strong>.
              A live selfie of the employee is required before submission.
            </p>
          </CardContent>
        </Card>
      )}

      <SystemScoresPanel
        systemScores={template?.sections.system_scores ?? []}
        values={instance.system_scores ?? {}}
        eligibility={template?.sections.eligibility_criteria}
        eligibilityInputs={instance.eligibility_inputs}
        employeeId={instance.employee_id}
        fiscalYear={fiscalYear}
        readOnly
      />

      <Card>
        <CardHeader>
          <CardTitle>{role ? `${role.replace('_', ' ')} review` : 'Read-only view'}</CardTitle>
        </CardHeader>
        <CardContent>
          <CriteriaScoringMatrix
            criteria={(template?.sections.criteria ?? []).filter((c) => !c.reviewer_stages?.length || (role && c.reviewer_stages.includes(role)))}
            values={draft.criteria_scores ?? {}}
            remarks={(draft.qualitative_responses ?? {}) as Record<string, string>}
            readOnly={!!locked}
            reviewerLabel={role ?? undefined}
            comparison={comparison}
            onChangeScore={(id, v) => setDraft((p) => ({ ...p, criteria_scores: { ...(p.criteria_scores ?? {}), [id]: v } }))}
            onChangeRemark={(id, t) => setDraft((p) => ({ ...p, qualitative_responses: { ...(p.qualitative_responses ?? {}), [id]: t } }))}
            onUploadEvidence={onUpload}
          />
        </CardContent>
      </Card>

      {role && !locked && (
        <div className="sticky bottom-0 bg-background/80 backdrop-blur border-t py-3 flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">{status === 'saving' ? 'Saving…' : status === 'saved' ? 'Draft saved' : status === 'error' ? 'Save error' : ''}</span>
          <div className="flex gap-2">
            {canSendBack && (
              <Button variant="outline" onClick={() => setSendBackOpen(true)} disabled={sendBack.isPending}>
                Send back
              </Button>
            )}
            <Button variant="outline" onClick={flush}>Save draft</Button>
            <Button onClick={handleSubmit} disabled={advance.isPending}>
              {advance.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {proxyMode ? 'Verify & Submit on behalf' : 'Submit & forward'}
            </Button>
          </div>
        </div>
      )}

      <AlertDialog open={sendBackOpen} onOpenChange={setSendBackOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Send back to previous stage?</AlertDialogTitle>
            <AlertDialogDescription>
              The previous reviewer will be notified and able to revise their response.
              This action is recorded in the audit log.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ar-sendback-reason">Reason (optional)</Label>
            <Textarea
              id="ar-sendback-reason"
              rows={3}
              value={sendBackReason}
              onChange={(e) => setSendBackReason(e.target.value)}
              placeholder="What needs to be revised?"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleSendBack} disabled={sendBack.isPending}>
              {sendBack.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Send back
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {proxyMode && (
        <AssistedSubmissionDialog
          open={assistedOpen}
          onOpenChange={setAssistedOpen}
          instanceId={instance.id}
          employeeUserId={instance.employee_id}
          employeeName={instance.employee?.full_name ?? 'Employee'}
          proxyRoleLabel={
            instance.manager_id === user?.id ? 'reporting_manager'
              : instance.skip_id === user?.id ? 'skip_level'
              : 'authorized_proxy'
          }
          proxyDisplayName={profile?.full_name ?? 'Proxy'}
          onSubmitted={() => {
            void queryClient.invalidateQueries({ queryKey: ['annual-review'] });
          }}
        />
      )}
    </div>
  );
}