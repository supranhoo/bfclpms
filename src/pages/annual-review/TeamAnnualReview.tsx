import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useIsMobile } from '@/hooks/use-mobile';
import {
  useActiveCycle,
  useReviewerInstances,
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2, ChevronRight, Scale } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import type { AnnualReviewerRole, EvidenceItem } from '@/types/annualReview';
import type { InstanceWithEmployee } from '@/services/annualReview/annualReviewService';
import { enabledChain } from '@/lib/annualReview/stageChain';

const STAGE_FOR_REVIEWER = (inst: InstanceWithEmployee, uid: string): AnnualReviewerRole | null => {
  if (inst.overall_status === 'pending_manager' && inst.manager_id === uid) return 'manager';
  if (inst.overall_status === 'pending_skip' && inst.skip_id === uid) return 'skip_manager';
  if (inst.overall_status === 'pending_bu' && inst.bu_head_id === uid) return 'bu_head';
  if (inst.overall_status === 'pending_hr' && inst.hr_id === uid) return 'hr';
  return null;
};

export default function TeamAnnualReview() {
  const { user } = useAuth();
  const { data: cycle } = useActiveCycle();
  const { data: instances = [], isLoading } = useReviewerInstances(user?.id, cycle?.id);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [drawer, setDrawer] = useState(false);

  const isMobile = useIsMobile();

  const filtered = useMemo(
    () => instances.filter((i) => !search || (i.employee?.full_name ?? '').toLowerCase().includes(search.toLowerCase())),
    [instances, search],
  );

  useEffect(() => {
    if (!selectedId && filtered.length) setSelectedId(filtered[0].id);
  }, [filtered, selectedId]);

  const selected = filtered.find((i) => i.id === selectedId) ?? null;

  const onPick = (id: string) => {
    setSelectedId(id);
    if (isMobile) setDrawer(true);
  };

  if (!cycle) return <div className="p-6">No active annual review cycle.</div>;
  if (isLoading) return <div className="p-6 flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;

  const list = (
    <div className="space-y-2">
      <Input placeholder="Search employee…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <ul className="space-y-1">
        {filtered.map((i) => {
          const stage = user ? STAGE_FOR_REVIEWER(i, user.id) : null;
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onPick(i.id)}
                className={`w-full text-left rounded-md border p-3 hover:bg-muted/50 transition-colors min-h-10 ${selectedId === i.id ? 'bg-muted border-primary/50' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-medium truncate">{i.employee?.full_name ?? i.employee_id}</p>
                    <p className="text-xs text-muted-foreground truncate">{i.employee?.employee_code} · {i.employee?.designation ?? '—'}</p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <AnnualReviewStatusBadge status={i.overall_status} />
                  {stage && <span className="text-xs text-amber-500">Awaiting you</span>}
                </div>
              </button>
            </li>
          );
        })}
        {filtered.length === 0 && <li className="text-sm text-muted-foreground p-4 text-center">No reports.</li>}
      </ul>
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
          {selected ? <ReviewDetail instance={selected} /> : <Card><CardContent className="p-6 text-muted-foreground">Pick someone to review.</CardContent></Card>}
        </section>
      </div>

      <Sheet open={drawer} onOpenChange={setDrawer}>
        <SheetContent side="bottom" className="h-[92dvh] overflow-y-auto">
          {selected && <ReviewDetail instance={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function ReviewDetail({ instance }: { instance: InstanceWithEmployee }) {
  const { user } = useAuth();
  const { data: template } = useTemplate(
    (instance as { template_override_id?: string | null }).template_override_id ?? instance.template_id,
  );
  const { data: responses = [] } = useInstanceResponses(instance.id);
  const advance = useAdvanceStatus();
  const sendBack = useSendBackStatus();
  const upload = useUploadEvidence();
  const role = user ? STAGE_FOR_REVIEWER(instance, user.id) : null;
  const myResponse = role ? responses.find((r) => r.reviewer_role === role) ?? null : null;
  const locked = !role || myResponse?.is_locked;
  const [sendBackOpen, setSendBackOpen] = useState(false);
  const [sendBackReason, setSendBackReason] = useState('');

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
            <AnnualReviewStatusBadge status={instance.overall_status} />
          </div>
        </CardHeader>
        <CardContent><AnnualReviewStageTracker status={instance.overall_status} enabledStages={instance.enabled_stages} /></CardContent>
      </Card>

      <SystemScoresPanel
        systemScores={template?.sections.system_scores ?? []}
        values={instance.system_scores ?? {}}
        eligibility={template?.sections.eligibility_criteria}
        eligibilityInputs={instance.eligibility_inputs}
        employeeId={instance.employee_id}
        fiscalYear={cycle?.review_year}
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
              {advance.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Submit & forward
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
    </div>
  );
}