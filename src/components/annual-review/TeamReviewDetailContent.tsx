import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useTemplate,
  useInstanceResponses,
  useAdvanceStatus,
  useDebouncedResponseDraft,
  useUploadEvidence,
  useSendBackStatus,
} from '@/hooks/useAnnualReview';
import { AnnualReviewStageTracker } from '@/components/annual-review/AnnualReviewStageTracker';
import { useShowReviewerNamesInStepper } from '@/hooks/useAnnualReviewSettings';
import { useActiveProfilesLite } from '@/hooks/useSafetyOrg';
import { buildReviewerNamesByStage } from '@/lib/annualReview/reviewerNames';
import { computeVisibleStages, computeStageResolutions } from '@/lib/annualReview/visibleStages';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { CriteriaScoringMatrix } from '@/components/annual-review/CriteriaScoringMatrix';
import { shouldHideCriteriaCard, criteriaForStage } from '@/lib/annualReview/templateVisibility';
import { SystemScoresPanel } from '@/components/annual-review/SystemScoresPanel';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
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
import { useProxyEligibility } from '@/hooks/useProxyEligibility';
import { AssistedSubmissionDialog } from '@/components/annual-review/AssistedSubmissionDialog';
import { Badge } from '@/components/ui/badge';
import { useQueryClient } from '@tanstack/react-query';
import { LanguageSwitcher } from '@/components/annual-review/LanguageSwitcher';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';
import { computeScoreComposition } from '@/lib/annualReview/scoringComposition';
import { AppraisalCompositionCard } from '@/components/annual-review/AppraisalCompositionCard';
import { useResolvedSystemScores } from '@/hooks/useResolvedSystemScores';

/**
 * Maps an instance + viewer to the role they're currently expected to fill.
 * Returns `null` when the viewer has no active role (read-only / proxy paths
 * handled separately).
 */
const STAGE_FOR_REVIEWER = (inst: InstanceWithEmployee, uid: string): AnnualReviewerRole | null => {
  if (inst.overall_status === 'pending_manager' && inst.manager_id === uid) return 'manager';
  if (inst.overall_status === 'pending_skip' && inst.skip_id === uid) return 'skip_manager';
  if (inst.overall_status === 'pending_bu' && inst.bu_head_id === uid) return 'bu_head';
  if (inst.overall_status === 'pending_hr' && inst.hr_id === uid) return 'hr';
  return null;
};

/**
 * Reviewer-side review body, shared by the dedicated detail page
 * (`/annual-review/team/:instanceId`). Extracted verbatim from the previous
 * inline `ReviewDetail` in TeamAnnualReview.tsx — no behavioural changes.
 */
export function TeamReviewDetailContent({
  instance,
  fiscalYear,
}: {
  instance: InstanceWithEmployee;
  fiscalYear?: number;
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
  const { data: showReviewerNames = false } = useShowReviewerNamesInStepper();
  const { data: profilesLite } = useActiveProfilesLite();
  const reviewerNamesByStage = useMemo(
    () => (showReviewerNames ? buildReviewerNamesByStage(instance, profilesLite) : undefined),
    [showReviewerNames, instance, profilesLite],
  );
  const visibleStages = useMemo(
    () => computeVisibleStages(instance, profilesLite) ?? instance.enabled_stages,
    [instance, profilesLite],
  );
  const skippedStages = useMemo(() => {
    const rows = computeStageResolutions(instance, profilesLite);
    if (!rows) return undefined;
    return rows
      .filter((r) => r.skipped && r.skipReason)
      .map((r) => ({ stage: r.stage, reason: r.skipReason! }));
  }, [instance, profilesLite]);
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

  const defLang = template?.sections.settings?.default_language ?? 'en';
  const availLangs = template?.sections.settings?.enable_multilingual
    ? template.sections.settings.available_languages ?? ['en']
    : ['en'];
  const [lang, setLang] = useState<string>(defLang);
  useEffect(() => { setLang(defLang); }, [template?.id, defLang]);

  const { draft, setDraft, flush, status } = useDebouncedResponseDraft({
    instanceId: instance.id,
    reviewerId: user?.id ?? '',
    role: role ?? 'manager',
    initial: myResponse,
    enabled: !!role && !locked,
  });

  const comparison = useMemo(() => {
    const labels: Record<AnnualReviewerRole, string> = { self: 'Self', manager: 'Manager', skip_manager: 'Skip', dept_head: 'Dept', bu_head: 'BU', hr: 'HR' };
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

  const chain = enabledChain(instance.enabled_stages);
  const canSendBack = !!role && role !== 'self' && chain.indexOf(role) > 0;

  const { values: resolvedSystemScores } = useResolvedSystemScores(template, instance, fiscalYear);
  const composition = useMemo(
    () => computeScoreComposition(template, resolvedSystemScores, draft.criteria_scores ?? {}),
    [template, resolvedSystemScores, draft.criteria_scores],
  );

  return (
    <AnnualReviewI18nProvider
      currentLanguage={lang}
      defaultLanguage={defLang}
      templateTranslations={template?.sections.translations}
      displayMode={template?.sections.display_mode}
      enableAudio={template?.sections.settings?.enable_audio === true}
    >
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>{instance.employee?.full_name ?? instance.employee_id}</CardTitle>
              <p className="text-sm text-muted-foreground">{instance.employee?.employee_code} · {instance.employee?.designation ?? '—'}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {availLangs.length > 1 && (
                <LanguageSwitcher value={lang} onChange={setLang} available={availLangs} />
              )}
              <AnnualReviewStatusBadge status={instance.overall_status} />
              {instance.submitted_via_proxy && (
                <Badge variant="secondary" className="text-xs">Submitted with assistance</Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent><AnnualReviewStageTracker status={instance.overall_status} enabledStages={visibleStages} reviewerNamesByStage={reviewerNamesByStage} skippedStages={skippedStages} /></CardContent>
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
        eligibilityRemark={instance.eligibility_remark}
        employeeId={instance.employee_id}
        fiscalYear={fiscalYear}
        readOnly
      />

      <AppraisalCompositionCard composition={composition} variant="full" />

      {role && shouldHideCriteriaCard(template, role) ? (
        <Card>
          <CardContent className="p-4 text-sm text-muted-foreground">
            No criteria to score for the {role.replace('_', ' ')} stage on this template. Review the system scores above and click Submit to advance.
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>{role ? `${role.replace('_', ' ')} review` : 'Read-only view'}</CardTitle>
          </CardHeader>
          <CardContent>
            <CriteriaScoringMatrix
              criteria={role
                ? criteriaForStage(template, role)
                : (template?.sections.criteria ?? [])}
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
      )}

      {role && !locked && (
        <div className="sticky bottom-0 bg-background/80 backdrop-blur border-t py-3 flex items-center justify-between gap-3">
          <span className={`text-xs ${status === 'pending' ? 'text-amber-600' : status === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {status === 'saving' ? 'Saving…'
              : status === 'saved' ? 'Draft saved'
              : status === 'error' ? 'Save error'
              : status === 'pending' ? 'Unsaved changes'
              : ''}
          </span>
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
            void queryClient.invalidateQueries({ queryKey: ['annualReview'] });
          }}
        />
      )}
    </div>
    </AnnualReviewI18nProvider>
  );
}